import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export const sources = sqliteTable('sources', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  config: text('config').notNull(),
  status: text('status').notNull().default('inactive'),
  lastSync: integer('lastSync', { mode: 'timestamp_ms' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const conversionJobs = sqliteTable(
  'conversion_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    sourceId: text('sourceId')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    fileName: text('fileName').notNull(),
    filePath: text('filePath').notNull(),
    outputPath: text('outputPath'),
    fileSize: integer('fileSize'),
    status: text('status').notNull().default('pending'),
    progress: integer('progress').notNull().default(0),
    error: text('error'),
    startedAt: integer('startedAt', { mode: 'timestamp_ms' }),
    completedAt: integer('completedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('conversion_jobs_status_createdAt_idx').on(table.status, table.createdAt),
    index('conversion_jobs_sourceId_status_idx').on(table.sourceId, table.status),
    index('conversion_jobs_createdAt_idx').on(table.createdAt),
  ],
);

export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    sourceId: text('sourceId')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    status: text('status').notNull(),
    message: text('message').notNull(),
    details: text('details'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('sync_logs_sourceId_createdAt_idx').on(table.sourceId, table.createdAt),
    index('sync_logs_status_createdAt_idx').on(table.status, table.createdAt),
  ],
);

export const convertedFiles = sqliteTable(
  'converted_files',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    originalPath: text('originalPath').notNull(),
    convertedPath: text('convertedPath').notNull(),
    fileName: text('fileName').notNull(),
    fileType: text('fileType').notNull(),
    platform: text('platform').notNull(),
    checksum: text('checksum').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('converted_files_originalPath_platform_unique').on(
      table.originalPath,
      table.platform,
    ),
    index('converted_files_platform_createdAt_idx').on(table.platform, table.createdAt),
    index('converted_files_checksum_idx').on(table.checksum),
  ],
);

export const sourcesRelations = relations(sources, ({ many }) => ({
  jobs: many(conversionJobs),
  syncLogs: many(syncLogs),
}));

export const conversionJobsRelations = relations(conversionJobs, ({ one }) => ({
  source: one(sources, {
    fields: [conversionJobs.sourceId],
    references: [sources.id],
  }),
}));

export const syncLogsRelations = relations(syncLogs, ({ one }) => ({
  source: one(sources, {
    fields: [syncLogs.sourceId],
    references: [sources.id],
  }),
}));
