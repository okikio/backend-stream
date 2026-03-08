import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── timestamps helper ────────────────────────────────────────────────────────
const tstz = (name: string) => timestamp(name, { withTimezone: true, precision: 0 });
const tstzNow = (name: string) => tstz(name).defaultNow().notNull();

// ─── bookmarks ────────────────────────────────────────────────────────────────
export const bookmarks = pgTable(
  'bookmarks',
  {
    tmdb_id: varchar('tmdb_id', { length: 255 }).notNull(),
    user_id: varchar('user_id', { length: 255 }).notNull(),
    meta: jsonb('meta').notNull(),
    updated_at: tstz('updated_at').notNull(),
    group: text('group').array().notNull().default([]),
    favorite_episodes: text('favorite_episodes').array().notNull().default([]),
  },
  table => [primaryKey({ columns: [table.tmdb_id, table.user_id] })],
);

// ─── challenge_codes ──────────────────────────────────────────────────────────
export const challenge_codes = pgTable('challenge_codes', {
  code: uuid('code').primaryKey(),
  flow: text('flow').notNull(),
  auth_type: varchar('auth_type', { length: 255 }).notNull(),
  created_at: tstz('created_at').notNull(),
  expires_at: tstz('expires_at').notNull(),
});

// ─── lists ────────────────────────────────────────────────────────────────────
export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey(),
    user_id: varchar('user_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }),
    created_at: tstzNow('created_at'),
    updated_at: tstz('updated_at').notNull(),
    public: boolean('public').default(false).notNull(),
  },
  table => [index('lists_user_id_index').on(table.user_id)],
);

// ─── list_items ───────────────────────────────────────────────────────────────
export const list_items = pgTable(
  'list_items',
  {
    id: uuid('id').primaryKey(),
    list_id: uuid('list_id')
      .notNull()
      .references(() => lists.id),
    tmdb_id: varchar('tmdb_id', { length: 255 }).notNull(),
    added_at: tstzNow('added_at'),
    type: varchar('type', { length: 255 }),
  },
  table => [uniqueIndex('list_items_list_id_tmdb_id_unique').on(table.list_id, table.tmdb_id)],
);

// ─── progress_items ───────────────────────────────────────────────────────────
export const progress_items = pgTable(
  'progress_items',
  {
    id: uuid('id').primaryKey(),
    tmdb_id: varchar('tmdb_id', { length: 255 }).notNull(),
    user_id: varchar('user_id', { length: 255 }).notNull(),
    season_id: varchar('season_id', { length: 255 }),
    episode_id: varchar('episode_id', { length: 255 }),
    meta: jsonb('meta').notNull(),
    updated_at: tstz('updated_at').notNull(),
    duration: bigint('duration', { mode: 'bigint' }).notNull(),
    watched: bigint('watched', { mode: 'bigint' }).notNull(),
    season_number: integer('season_number'),
    episode_number: integer('episode_number'),
  },
  table => [
    uniqueIndex('progress_items_tmdb_id_user_id_season_id_episode_id_unique')
      .on(table.tmdb_id, table.user_id, table.season_id, table.episode_id),
  ],
);

// ─── sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  user: text('user').notNull(),
  created_at: tstz('created_at').notNull(),
  accessed_at: tstz('accessed_at').notNull(),
  expires_at: tstz('expires_at').notNull(),
  device: text('device').notNull(),
  user_agent: text('user_agent').notNull(),
});

// ─── user_group_order ─────────────────────────────────────────────────────────
export const user_group_order = pgTable('user_group_order', {
  id: uuid('id').primaryKey(),
  user_id: varchar('user_id', { length: 255 }).unique().notNull(),
  group_order: text('group_order').array().notNull().default([]),
  created_at: tstzNow('created_at'),
  updated_at: tstzNow('updated_at'),
});

// ─── user_settings ────────────────────────────────────────────────────────────
export const user_settings = pgTable('user_settings', {
  id: text('id').primaryKey(),
  application_theme: varchar('application_theme', { length: 255 }),
  custom_theme: jsonb('custom_theme'),
  application_language: varchar('application_language', { length: 255 }),
  default_subtitle_language: varchar('default_subtitle_language', { length: 255 }),
  proxy_urls: text('proxy_urls').array().notNull().default([]),
  trakt_key: varchar('trakt_key', { length: 255 }),
  febbox_key: varchar('febbox_key', { length: 255 }),
  enable_autoplay: boolean('enable_autoplay').default(true).notNull(),
  enable_carousel_view: boolean('enable_carousel_view').default(false).notNull(),
  enable_details_modal: boolean('enable_details_modal').default(false).notNull(),
  enable_discover: boolean('enable_discover').default(true).notNull(),
  enable_featured: boolean('enable_featured').default(false).notNull(),
  enable_image_logos: boolean('enable_image_logos').default(true).notNull(),
  enable_skip_credits: boolean('enable_skip_credits').default(true).notNull(),
  enable_source_order: boolean('enable_source_order').default(false).notNull(),
  enable_thumbnails: boolean('enable_thumbnails').default(false).notNull(),
  proxy_tmdb: boolean('proxy_tmdb').default(false).notNull(),
  source_order: text('source_order').array().notNull().default([]),
  disabled_embeds: text('disabled_embeds').array().notNull().default([]),
  disabled_sources: text('disabled_sources').array().notNull().default([]),
  embed_order: text('embed_order').array().notNull().default([]),
  enable_double_click_to_seek: boolean('enable_double_click_to_seek').default(false).notNull(),
  enable_embed_order: boolean('enable_embed_order').default(false).notNull(),
  enable_hold_to_boost: boolean('enable_hold_to_boost').default(false).notNull(),
  enable_low_performance_mode: boolean('enable_low_performance_mode').default(false).notNull(),
  enable_native_subtitles: boolean('enable_native_subtitles').default(false).notNull(),
  force_compact_episode_view: boolean('force_compact_episode_view').default(false).notNull(),
  home_section_order: text('home_section_order').array().notNull().default([]),
  manual_source_selection: boolean('manual_source_selection').default(false).notNull(),
  debrid_service: varchar('debrid_service', { length: 255 }),
  debrid_token: varchar('debrid_token', { length: 255 }),
  enable_auto_resume_on_playback_error: boolean('enable_auto_resume_on_playback_error')
    .default(false)
    .notNull(),
  tidb_key: varchar('tidb_key', { length: 255 }),
  enable_pause_overlay: boolean('enable_pause_overlay').default(false).notNull(),
});

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  public_key: text('public_key').unique().notNull(),
  namespace: varchar('namespace', { length: 255 }).notNull(),
  created_at: tstz('created_at').notNull(),
  last_logged_in: tstz('last_logged_in'),
  permissions: text('permissions').array().notNull().default([]),
  profile: jsonb('profile').notNull(),
  ratings: jsonb('ratings').notNull().default([]),
  nickname: varchar('nickname', { length: 255 }).notNull(),
});

// ─── watch_history ────────────────────────────────────────────────────────────
export const watch_history = pgTable(
  'watch_history',
  {
    id: uuid('id').primaryKey(),
    user_id: varchar('user_id', { length: 255 }).notNull(),
    tmdb_id: varchar('tmdb_id', { length: 255 }).notNull(),
    season_id: varchar('season_id', { length: 255 }),
    episode_id: varchar('episode_id', { length: 255 }),
    meta: jsonb('meta').notNull(),
    duration: doublePrecision('duration').notNull(),
    watched: doublePrecision('watched').notNull(),
    watched_at: tstz('watched_at').notNull(),
    completed: boolean('completed').default(false).notNull(),
    season_number: integer('season_number'),
    episode_number: integer('episode_number'),
    updated_at: tstzNow('updated_at'),
  },
  table => [
    uniqueIndex('watch_history_tmdb_id_user_id_season_id_episode_id_unique')
      .on(table.tmdb_id, table.user_id, table.season_id, table.episode_id),
  ],
);

// Export type helpers
export type Bookmark = typeof bookmarks.$inferSelect;
export type ChallengeCode = typeof challenge_codes.$inferSelect;
export type List = typeof lists.$inferSelect;
export type ListItem = typeof list_items.$inferSelect;
export type ProgressItem = typeof progress_items.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserGroupOrder = typeof user_group_order.$inferSelect;
export type UserSettings = typeof user_settings.$inferSelect;
export type User = typeof users.$inferSelect;
export type WatchHistory = typeof watch_history.$inferSelect;
