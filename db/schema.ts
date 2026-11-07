// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  imageKey: text('image_key').notNull(),
  status: text('status').notNull().default('uploaded'),
  draft: text('draft'),
  evidence: text('evidence'),
  error: text('error'),
  version: integer('version').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('documents_owner_updated').on(table.owner, table.updatedAt)]);
