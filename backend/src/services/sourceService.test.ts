import { describe, it, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import { createFakeDb, makeFakeDbState, type FakeDbState } from '../test/dbMock.js';

const dbState: FakeDbState = makeFakeDbState();
const fakeDb = createFakeDb(dbState);

const monitoringStub = {
  startSourceMonitoring: mock(async () => undefined),
  stopSourceMonitoring: mock(async () => undefined),
  syncSource: mock(async () => undefined),
};

class FakeConverterService {
  createJob = mock(async () => ({ id: 'job-1' }));
  processJob = mock(async () => undefined);
}

const fakeConnector = {
  authenticate: mock(async () => true),
  testConnection: mock(async () => ({ success: true, message: 'ok' })),
  listFiles: mock(async () => [
    { id: '1', name: 'a.docx', size: 10, modifiedTime: new Date(), mimeType: null },
    { id: '2', name: 'b.png', size: 20, modifiedTime: new Date(), mimeType: 'image/png' },
  ]),
  listFolders: mock(async () => [{ id: 'f1', name: 'Folder' }]),
  cleanup: mock(async () => undefined),
};

type SvcCtor = new () => {
  createSource: (...args: unknown[]) => unknown;
  getSourceById: (id: string) => Promise<{ config: { destination?: string } }>;
  getAllSources: () => Promise<Array<{ config: { credentials?: unknown; destination?: string } }>>;
  testCredentials: (data: {
    platform: string;
    credentials: Record<string, string>;
  }) => Promise<{ success: boolean; message: string }>;
  previewGoogleDriveFiles: (
    folderId: string,
    creds: Record<string, string>,
    extensions: string[],
  ) => Promise<{ totalFiles: number; convertibleFiles: number; files: Array<{ id: string }> }>;
};

let SourceService: SvcCtor;
let originalDb: unknown;
let originalMonitoring: unknown;
let originalConversion: unknown;
let originalFactory: unknown;

beforeAll(async () => {
  // Capture originals so we can restore module exports for other test files.
  originalDb = await import('../config/database.js');
  originalMonitoring = await import('./monitoringService.js');
  originalConversion = await import('./conversionService.js');
  originalFactory = await import('../integrations/base/driveConnectorFactory.js');

  mock.module('../config/database.js', () => ({
    default: () => fakeDb,
    getDb: () => fakeDb,
  }));
  mock.module('./monitoringService.js', () => ({ default: monitoringStub }));
  mock.module('./conversionService.js', () => ({ default: FakeConverterService }));
  mock.module('../integrations/base/driveConnectorFactory.js', () => ({
    DriveConnectorFactory: {
      createConnector: mock(() => fakeConnector),
    },
  }));

  ({ default: SourceService } = (await import('./sourceService.js')) as { default: SvcCtor });
});

afterAll(() => {
  mock.module('../config/database.js', () => originalDb);
  mock.module('./monitoringService.js', () => originalMonitoring);
  mock.module('./conversionService.js', () => originalConversion);
  mock.module('../integrations/base/driveConnectorFactory.js', () => originalFactory);
});

beforeEach(() => {
  Object.assign(dbState, makeFakeDbState());
  monitoringStub.startSourceMonitoring.mockClear();
  monitoringStub.stopSourceMonitoring.mockClear();
  monitoringStub.syncSource.mockClear();
});

describe('SourceService.createSource', () => {
  it('rejects when required fields are missing', async () => {
    const svc = new SourceService();
    await expect(
      svc.createSource({ name: '', platform: '', config: {} } as unknown),
    ).rejects.toThrow(/Missing required fields/);
  });

  it('encrypts credentials and persists the source', async () => {
    dbState.insertRows = [
      {
        id: 'src-new',
        name: 'My Drive',
        platform: 'googledrive',
        config: '{}',
        status: 'active',
      },
    ];
    const svc = new SourceService();

    const result = (await svc.createSource({
      name: 'My Drive',
      platform: 'googledrive',
      config: { credentials: { token: 'abc' }, sourcePath: '/' },
    } as unknown)) as { id: string };

    expect(result.id).toBe('src-new');
  });
});

describe('SourceService.getSourceById', () => {
  it('throws when the source is missing', async () => {
    dbState.queryFindFirst = null;
    const svc = new SourceService();
    await expect(svc.getSourceById('missing')).rejects.toThrow('Source not found');
  });

  it('parses the stored JSON config', async () => {
    dbState.queryFindFirst = {
      id: 'src-1',
      name: 'Drive',
      platform: 'googledrive',
      config: JSON.stringify({ destination: 'out' }),
      status: 'active',
    };
    const svc = new SourceService();
    const result = await svc.getSourceById('src-1');
    expect(result.config.destination).toBe('out');
  });
});

describe('SourceService.getAllSources', () => {
  it('redacts encrypted credentials in the response', async () => {
    dbState.queryFindMany = [
      {
        id: 'a',
        name: 'A',
        platform: 'googledrive',
        config: JSON.stringify({ credentials: 'CIPHER', destination: 'x' }),
        status: 'active',
        jobs: [],
        syncLogs: [],
      },
    ];
    const svc = new SourceService();
    const sources = await svc.getAllSources();
    expect(sources[0]?.config.credentials).toBe('***encrypted***');
    expect(sources[0]?.config.destination).toBe('x');
  });
});

describe('SourceService.testCredentials', () => {
  it('returns the connector test result', async () => {
    fakeConnector.testConnection.mockImplementationOnce(async () => ({
      success: true,
      message: 'pong',
    }));
    const svc = new SourceService();

    const result = await svc.testCredentials({
      platform: 'googledrive',
      credentials: { token: 'abc' },
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('pong');
  });

  it('returns a failed payload when the connector throws', async () => {
    fakeConnector.testConnection.mockImplementationOnce(async () => {
      throw new Error('bad creds');
    });
    const svc = new SourceService();

    const result = await svc.testCredentials({
      platform: 'googledrive',
      credentials: { token: 'bad' },
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('bad creds');
  });
});

describe('SourceService.previewGoogleDriveFiles', () => {
  it('keeps files matching the allowed extensions and Google Docs mime types', async () => {
    fakeConnector.listFiles.mockImplementationOnce(async () => [
      { id: 'f1', name: 'doc.docx', size: 1, modifiedTime: new Date(), mimeType: null },
      { id: 'f2', name: 'note.txt', size: 1, modifiedTime: new Date(), mimeType: null },
      {
        id: 'f3',
        name: 'gdoc',
        size: 1,
        modifiedTime: new Date(),
        mimeType: 'application/vnd.google-apps.document',
      },
    ]);
    const svc = new SourceService();

    const preview = await svc.previewGoogleDriveFiles('folder', { token: 't' }, ['docx']);

    expect(preview.totalFiles).toBe(3);
    expect(preview.convertibleFiles).toBe(2);
    expect(preview.files.map((f) => f.id).sort()).toEqual(['f1', 'f3']);
  });
});
