import { access, writeFile, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import config from '../config/env.js';

/**
 * Health probes backing the deep readiness endpoint (`/api/monitoring/health`).
 *
 * `/api/health` stays a cheap liveness probe (no I/O) — that is what the Docker
 * HEALTHCHECK hits. The probes below may touch the filesystem, so they are only
 * run on demand.
 *
 * Each probe reports the value it observed alongside the threshold it was judged
 * against, so a caller can tell *why* a probe is degraded without reading the code.
 */

export type ProbeStatus = 'ok' | 'degraded' | 'down';

export interface ProbeResult {
  name: string;
  status: ProbeStatus;
  durationMs: number;
  message: string;
  observed?: string | number | null;
  threshold?: string;
}

export interface HealthReport {
  status: ProbeStatus;
  probes: ProbeResult[];
}

/** Snapshot of the monitoring loop, supplied by the caller to avoid re-querying. */
export interface MonitoringSnapshot {
  isRunning: boolean;
  activeMonitors: number;
  totalActiveSources: number;
  lastSync: Date | null;
  /** Destination folders of the active sources, relative to the export root. */
  exportDestinations: string[];
}

type ProbeOutcome = Omit<ProbeResult, 'name' | 'durationMs'>;

const PROBE_TIMEOUT_MS = 2000;

/** Severity order — a report is only as healthy as its worst probe. */
const SEVERITY: Record<ProbeStatus, number> = { ok: 0, degraded: 1, down: 2 };

/**
 * Runs a probe under a timeout and measures its duration. A probe that hangs is
 * reported as `down` rather than being allowed to hang the endpoint itself.
 */
async function runProbe(name: string, probe: () => Promise<ProbeOutcome>): Promise<ProbeResult> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<ProbeOutcome>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Probe timed out after ${PROBE_TIMEOUT_MS}ms`)),
        PROBE_TIMEOUT_MS,
      );
    });

    const outcome = await Promise.race([probe(), timeout]);
    return { name, durationMs: Date.now() - startedAt, ...outcome };
  } catch (error) {
    return {
      name,
      durationMs: Date.now() - startedAt,
      status: 'down',
      message: (error as Error).message,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Export root and every source destination must be writable.
 *
 * This is a real silent-failure mode: the directory is a bind mount
 * (`${EXPORT_PATH}:/app/exports`). If the host path is missing or read-only the
 * app keeps converting while nothing lands on disk.
 *
 * Files are written to per-source sub-directories, not to the root, so checking
 * only the root would miss the likeliest case: one destination turned read-only
 * while the mount itself stays fine.
 */
type WriteCheck = 'ok' | 'missing' | 'unwritable';

/**
 * Whether a directory can actually be written to.
 *
 * `access(W_OK)` is not enough. The export directory is a bind mount, and the
 * container runs as root: the permission bits can say "writable" while the host
 * filesystem refuses the write, so `access` returns success and the export still
 * fails with EACCES. Only attempting a write tells the truth — which is exactly
 * the failure mode this probe exists to catch.
 */
async function checkWritable(directory: string): Promise<WriteCheck> {
  try {
    await access(directory, fsConstants.F_OK);
  } catch {
    return 'missing';
  }

  const probeFile = path.join(directory, `.doc2ai-write-probe-${String(process.pid)}`);

  try {
    await writeFile(probeFile, '');
    return 'ok';
  } catch {
    return 'unwritable';
  } finally {
    await unlink(probeFile).catch(() => undefined);
  }
}

async function checkExportPath(destinations: string[]): Promise<ProbeOutcome> {
  const threshold = 'export root and every source destination are writable';
  const targets = [
    config.exportPath,
    ...destinations.map((destination) => path.join(config.exportPath, destination)),
  ];

  const unwritable: string[] = [];

  for (const target of targets) {
    const result = await checkWritable(target);

    // A destination that does not exist yet is fine — it is created on the first
    // export, and the root check already covers whether that can work.
    if (result === 'missing' && target !== config.exportPath) continue;
    if (result !== 'ok') unwritable.push(target);
  }

  if (unwritable.length > 0) {
    return {
      status: 'down',
      message: `Not writable: ${unwritable.join(', ')}`,
      observed: unwritable.join(', '),
      threshold,
    };
  }

  return {
    status: 'ok',
    message: `Export root and ${String(destinations.length)} destination(s) are writable`,
    observed: config.exportPath,
    threshold,
  };
}

/**
 * Age of the last successful synchronisation, judged against the configured sync
 * interval. `lastSync` is seeded when a source starts being monitored and moves
 * forward on every successful sync, so a stalled loop shows up as a growing age
 * even though the process is still alive.
 *
 * Thresholds are relative to SYNC_INTERVAL_MINUTES: one missed cycle can be a
 * transient API error, several in a row means the loop is stuck.
 */
function checkSyncFreshness(monitoring: MonitoringSnapshot): ProbeOutcome {
  const intervalMs = config.syncIntervalMinutes * 60 * 1000;
  const degradedAfterMs = intervalMs * 2;
  const downAfterMs = intervalMs * 4;
  const threshold = `degraded > ${config.syncIntervalMinutes * 2}min, down > ${config.syncIntervalMinutes * 4}min`;

  if (monitoring.totalActiveSources === 0) {
    return {
      status: 'ok',
      message: 'No active source to synchronise',
      observed: null,
      threshold,
    };
  }

  if (monitoring.lastSync === null) {
    return {
      status: 'degraded',
      message: 'Active sources exist but no synchronisation has been recorded yet',
      observed: null,
      threshold,
    };
  }

  const ageMs = Date.now() - monitoring.lastSync.getTime();
  const ageMinutes = Math.round(ageMs / 60000);

  if (ageMs > downAfterMs) {
    return {
      status: 'down',
      message: `Last synchronisation was ${String(ageMinutes)}min ago — the sync loop looks stalled`,
      observed: ageMinutes,
      threshold,
    };
  }

  if (ageMs > degradedAfterMs) {
    return {
      status: 'degraded',
      message: `Last synchronisation was ${String(ageMinutes)}min ago — at least one cycle was missed`,
      observed: ageMinutes,
      threshold,
    };
  }

  return {
    status: 'ok',
    message: `Last synchronisation was ${String(ageMinutes)}min ago`,
    observed: ageMinutes,
    threshold,
  };
}

/**
 * The monitoring loop itself: running, and watching every active source.
 *
 * A missing monitor degrades rather than downs the service — the API and already
 * converted files stay usable, only new changes go undetected.
 */
function checkMonitoringLoop(monitoring: MonitoringSnapshot): ProbeOutcome {
  const threshold = 'service running and one monitor per active source';

  if (!monitoring.isRunning) {
    return {
      status: 'down',
      message: 'Monitoring service is not running',
      observed: 0,
      threshold,
    };
  }

  if (monitoring.activeMonitors !== monitoring.totalActiveSources) {
    return {
      status: 'degraded',
      message: `${String(monitoring.activeMonitors)} monitor(s) running for ${String(monitoring.totalActiveSources)} active source(s)`,
      observed: monitoring.activeMonitors,
      threshold,
    };
  }

  return {
    status: 'ok',
    message: `Monitoring ${String(monitoring.activeMonitors)} active source(s)`,
    observed: monitoring.activeMonitors,
    threshold,
  };
}

/** Worst probe wins. */
export function aggregateStatus(probes: ProbeResult[]): ProbeStatus {
  return probes.reduce<ProbeStatus>(
    (worst, probe) => (SEVERITY[probe.status] > SEVERITY[worst] ? probe.status : worst),
    'ok',
  );
}

export async function runHealthProbes(monitoring: MonitoringSnapshot): Promise<HealthReport> {
  const probes = await Promise.all([
    runProbe('monitoring', () => Promise.resolve(checkMonitoringLoop(monitoring))),
    runProbe('exportPath', () => checkExportPath(monitoring.exportDestinations)),
    runProbe('syncFreshness', () => Promise.resolve(checkSyncFreshness(monitoring))),
  ]);

  return { status: aggregateStatus(probes), probes };
}
