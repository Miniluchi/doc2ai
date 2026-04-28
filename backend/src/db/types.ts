import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { sources, conversionJobs, syncLogs, convertedFiles } from './schema.js';

export type Source = InferSelectModel<typeof sources>;
export type NewSource = InferInsertModel<typeof sources>;

export type ConversionJob = InferSelectModel<typeof conversionJobs>;
export type NewConversionJob = InferInsertModel<typeof conversionJobs>;

export type SyncLog = InferSelectModel<typeof syncLogs>;
export type NewSyncLog = InferInsertModel<typeof syncLogs>;

export type ConvertedFile = InferSelectModel<typeof convertedFiles>;
export type NewConvertedFile = InferInsertModel<typeof convertedFiles>;
