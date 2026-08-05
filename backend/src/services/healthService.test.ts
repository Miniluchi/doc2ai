import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, mkdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import config from '../config/env.js';
import {
  aggregateStatus,
  runHealthProbes,
  type MonitoringSnapshot,
  type ProbeResult,
} from './healthService.js';

const INTERVAL_MS = config.syncIntervalMinutes * 60 * 1000;

function snapshot(overrides: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    isRunning: true,
    activeMonitors: 1,
    totalActiveSources: 1,
    lastSync: new Date(),
    exportDestinations: [],
    ...overrides,
  };
}

function probe(report: { probes: ProbeResult[] }, name: string): ProbeResult {
  const found = report.probes.find((p) => p.name === name);
  if (!found) throw new Error(`Probe "${name}" not found`);
  return found;
}

// The configured EXPORT_PATH does not exist in a test environment, which would
// make every probe run report `down`. Point it at a real writable directory so
// each test controls exactly the one condition it is asserting on.
let writableExportDir: string;
let configuredExportPath: string;

beforeAll(async () => {
  writableExportDir = await mkdtemp(path.join(tmpdir(), 'doc2ai-exports-'));
  configuredExportPath = config.exportPath;
  config.exportPath = writableExportDir;
});

afterAll(async () => {
  config.exportPath = configuredExportPath;
  await rm(writableExportDir, { recursive: true, force: true });
});

describe('aggregateStatus', () => {
  const base = { durationMs: 0, message: '' };

  it('is ok when every probe is ok', () => {
    expect(
      aggregateStatus([
        { name: 'a', status: 'ok', ...base },
        { name: 'b', status: 'ok', ...base },
      ]),
    ).toBe('ok');
  });

  it('takes the worst status across probes', () => {
    expect(
      aggregateStatus([
        { name: 'a', status: 'ok', ...base },
        { name: 'b', status: 'degraded', ...base },
      ]),
    ).toBe('degraded');

    expect(
      aggregateStatus([
        { name: 'a', status: 'degraded', ...base },
        { name: 'b', status: 'down', ...base },
        { name: 'c', status: 'ok', ...base },
      ]),
    ).toBe('down');
  });

  it('is ok with no probes at all', () => {
    expect(aggregateStatus([])).toBe('ok');
  });
});

describe('syncFreshness probe', () => {
  it('is ok for a synchronisation within the configured interval', async () => {
    const report = await runHealthProbes(snapshot({ lastSync: new Date() }));
    expect(probe(report, 'syncFreshness').status).toBe('ok');
  });

  it('degrades past twice the sync interval', async () => {
    const lastSync = new Date(Date.now() - INTERVAL_MS * 2 - 60_000);
    const report = await runHealthProbes(snapshot({ lastSync }));
    expect(probe(report, 'syncFreshness').status).toBe('degraded');
  });

  it('goes down past four times the sync interval', async () => {
    const lastSync = new Date(Date.now() - INTERVAL_MS * 4 - 60_000);
    const report = await runHealthProbes(snapshot({ lastSync }));
    expect(probe(report, 'syncFreshness').status).toBe('down');
  });

  it('stays ok when there is no active source to synchronise', async () => {
    const report = await runHealthProbes(
      snapshot({ totalActiveSources: 0, activeMonitors: 0, lastSync: null }),
    );
    expect(probe(report, 'syncFreshness').status).toBe('ok');
  });

  it('degrades when active sources have never synchronised', async () => {
    const report = await runHealthProbes(snapshot({ lastSync: null }));
    expect(probe(report, 'syncFreshness').status).toBe('degraded');
  });

  it('reports the observed age and the threshold it was judged against', async () => {
    const lastSync = new Date(Date.now() - INTERVAL_MS * 2 - 60_000);
    const result = probe(await runHealthProbes(snapshot({ lastSync })), 'syncFreshness');

    expect(result.observed).toBe(config.syncIntervalMinutes * 2 + 1);
    expect(result.threshold).toContain(String(config.syncIntervalMinutes * 4));
  });
});

describe('exportPath probe', () => {
  it('is ok when the configured export directory is writable', async () => {
    const report = await runHealthProbes(snapshot());
    const result = probe(report, 'exportPath');

    expect(result.status).toBe('ok');
    expect(result.observed).toBe(writableExportDir);
  });

  it('goes down when the export directory is missing', async () => {
    const original = config.exportPath;
    config.exportPath = path.join(tmpdir(), 'doc2ai-missing-export-dir');

    try {
      const report = await runHealthProbes(snapshot());
      expect(probe(report, 'exportPath').status).toBe('down');
      expect(report.status).toBe('down');
    } finally {
      config.exportPath = original;
    }
  });

  describe('when the export directory is read-only', () => {
    let readOnlyDir: string;
    let original: string;
    // chmod is a no-op for root, which can write to a 0o500 directory anyway.
    const skipAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;

    beforeAll(async () => {
      readOnlyDir = await mkdtemp(path.join(tmpdir(), 'doc2ai-readonly-'));
      await chmod(readOnlyDir, 0o500);
      original = config.exportPath;
      config.exportPath = readOnlyDir;
    });

    afterAll(async () => {
      config.exportPath = original;
      await chmod(readOnlyDir, 0o700);
      await rm(readOnlyDir, { recursive: true, force: true });
    });

    it.skipIf(skipAsRoot)('goes down', async () => {
      const report = await runHealthProbes(snapshot());
      expect(probe(report, 'exportPath').status).toBe('down');
    });
  });

  // Regression tests for #52: only the export root used to be checked, so a
  // destination turned read-only stayed invisible while every export failed.
  describe('per-source destinations', () => {
    const skipAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    let destinationDir: string;

    beforeAll(async () => {
      destinationDir = path.join(writableExportDir, 'test_doc');
      await mkdir(destinationDir, { recursive: true });
    });

    it('is ok when the destination exists and is writable', async () => {
      const report = await runHealthProbes(snapshot({ exportDestinations: ['test_doc'] }));
      expect(probe(report, 'exportPath').status).toBe('ok');
    });

    it('stays ok when a destination has not been created yet', async () => {
      const report = await runHealthProbes(snapshot({ exportDestinations: ['never-exported'] }));
      expect(probe(report, 'exportPath').status).toBe('ok');
    });

    it.skipIf(skipAsRoot)(
      'goes down when a destination is read-only while the root stays writable',
      async () => {
        await chmod(destinationDir, 0o500);

        try {
          const report = await runHealthProbes(snapshot({ exportDestinations: ['test_doc'] }));
          const result = probe(report, 'exportPath');

          expect(result.status).toBe('down');
          expect(result.message).toContain('test_doc');
          expect(report.status).toBe('down');
        } finally {
          await chmod(destinationDir, 0o700);
        }
      },
    );
  });
});

describe('monitoring probe', () => {
  it('goes down when the monitoring service is stopped', async () => {
    const report = await runHealthProbes(snapshot({ isRunning: false }));
    expect(probe(report, 'monitoring').status).toBe('down');
  });

  it('degrades when a source has no monitor attached', async () => {
    const report = await runHealthProbes(snapshot({ activeMonitors: 1, totalActiveSources: 2 }));
    expect(probe(report, 'monitoring').status).toBe('degraded');
    expect(report.status).toBe('degraded');
  });
});

describe('runHealthProbes', () => {
  it('returns every probe with a measured duration', async () => {
    const report = await runHealthProbes(snapshot());

    expect(report.probes.map((p) => p.name).sort()).toEqual([
      'exportPath',
      'monitoring',
      'syncFreshness',
    ]);
    for (const p of report.probes) {
      expect(p.durationMs).toBeGreaterThanOrEqual(0);
      expect(p.message).not.toBe('');
    }
  });
});
