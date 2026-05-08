import { describe, it, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import { createFakeDb, makeFakeDbState, type FakeDbState } from '../../test/dbMock.js';

const dbState: FakeDbState = makeFakeDbState();
const fakeDb = createFakeDb(dbState);

const fsExtraStub = {
  ensureDir: mock(async () => undefined),
  readFile: mock(async () => Buffer.from('')),
  writeFile: mock(async () => undefined),
  pathExists: mock(async () => true),
  remove: mock(async () => undefined),
  copy: mock(async () => undefined),
  stat: mock(async () => ({ size: 1, isFile: () => true, mtime: new Date(), birthtime: new Date() })),
  createReadStream: () => ({ on: () => undefined }),
  createWriteStream: () => ({ on: () => undefined }),
};

interface SvcInstance {
  cancelJob(id: string): Promise<{ id: string; status: string }>;
  cleanupCompletedJobs(days?: number): Promise<number>;
  getJobById(id: string): Promise<{ id: string; source: { config: { destination?: string } } }>;
  getJobStats(): Promise<{ byStatus: Record<string, number>; recent: number }>;
}

let ConversionService: new () => SvcInstance;
let originalDb: unknown;
let originalFsExtra: unknown;

beforeAll(async () => {
  originalDb = await import('../config/database.js');
  originalFsExtra = await import('fs-extra');

  mock.module('../config/database.js', () => ({
    default: () => fakeDb,
    getDb: () => fakeDb,
  }));
  mock.module('fs-extra', () => ({ default: fsExtraStub, ...fsExtraStub }));

  ({ default: ConversionService } = (await import('./conversionService.js')) as {
    default: new () => SvcInstance;
  });
});

afterAll(() => {
  mock.module('../config/database.js', () => originalDb);
  mock.module('fs-extra', () => originalFsExtra);
});

beforeEach(() => {
  Object.assign(dbState, makeFakeDbState());
});

describe('ConversionService.cancelJob', () => {
  it('returns the cancelled job when the update returns a row', async () => {
    dbState.updateRows = [
      { id: 'job-1', fileName: 'a.docx', status: 'failed', error: 'Cancelled by user' },
    ];
    const svc = new ConversionService();

    const result = await svc.cancelJob('job-1');

    expect(result.id).toBe('job-1');
    expect(result.status).toBe('failed');
  });

  it('throws when no matching row is returned', async () => {
    dbState.updateRows = [];
    const svc = new ConversionService();

    await expect(svc.cancelJob('missing')).rejects.toThrow('Job not found or cannot be cancelled');
  });
});

describe('ConversionService.cleanupCompletedJobs', () => {
  it('returns the number of deleted rows', async () => {
    dbState.deleteRows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const svc = new ConversionService();

    expect(await svc.cleanupCompletedJobs(7)).toBe(3);
  });

  it('returns zero when nothing is deleted', async () => {
    dbState.deleteRows = [];
    const svc = new ConversionService();
    expect(await svc.cleanupCompletedJobs()).toBe(0);
  });
});

describe('ConversionService.getJobById', () => {
  it('throws when the job does not exist', async () => {
    dbState.queryFindFirst = null;
    const svc = new ConversionService();
    await expect(svc.getJobById('nope')).rejects.toThrow('Conversion job not found');
  });

  it('returns the job with parsed source config when found', async () => {
    dbState.queryFindFirst = {
      id: 'job-2',
      fileName: 'a.pdf',
      filePath: '/tmp/a.pdf',
      status: 'pending',
      source: {
        id: 'src-1',
        name: 'Drive',
        platform: 'googledrive',
        config: JSON.stringify({ destination: 'out' }),
      },
    };
    const svc = new ConversionService();

    const result = await svc.getJobById('job-2');
    expect(result.id).toBe('job-2');
    expect(result.source.config.destination).toBe('out');
  });
});

describe('ConversionService.getJobStats', () => {
  it('reduces grouped counts and recent total', async () => {
    let call = 0;
    fakeDb.select = () => {
      call += 1;
      if (call === 1) {
        return makeFakeChain([
          { status: 'completed', cnt: 4 },
          { status: 'failed', cnt: 1 },
        ]);
      }
      return makeFakeChain([{ recent: 9 }]);
    };
    const svc = new ConversionService();

    const stats = await svc.getJobStats();
    expect(stats.byStatus).toEqual({ completed: 4, failed: 1 });
    expect(stats.recent).toBe(9);
  });
});

function makeFakeChain<T>(value: T) {
  const handler: ProxyHandler<() => unknown> = {
    get(_t, p) {
      if (p === 'then') return (res: (v: T) => unknown) => Promise.resolve(value).then(res);
      return () => proxy;
    },
  };
  const proxy = new Proxy(() => proxy, handler) as unknown as PromiseLike<T> &
    Record<string, unknown>;
  return proxy;
}
