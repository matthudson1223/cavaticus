import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  uniqueIndex,
  jsonb,
  real,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'claude' | 'openai' | 'gemini'
    encryptedKey: text('encrypted_key').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('api_keys_user_provider_idx').on(t.userId, t.provider)],
);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    content: text('content').notNull().default(''),
    mimeType: text('mime_type').notNull().default('text/plain'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('files_project_path_idx').on(t.projectId, t.path)],
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  attachments: jsonb('attachments').notNull().default('[]'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('dark'),
  defaultProvider: text('default_provider'),
  editorFontSize: integer('editor_font_size').notNull().default(14),
  settingsJson: jsonb('settings_json').notNull().default('{}'),
});

export const userModels = pgTable(
  'user_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    label: text('label'),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_models_user_model_idx').on(t.userId, t.modelId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    description: text('description'),
    status: text('status').notNull().default('pending'), // pending | in_progress | completed | cancelled
    activeForm: text('active_form'),
    blocks: text('blocks').array().notNull().default([]),
    blockedBy: text('blocked_by').array().notNull().default([]),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }), // nullable = user scope
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(), // user | feedback | project | reference
    content: text('content').notNull(),
    confidence: real('confidence').notNull().default(1.0),
    scope: text('scope').notNull().default('project'), // user | project
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memories_user_name_scope_idx').on(t.userId, t.name, t.scope),
  ],
);
