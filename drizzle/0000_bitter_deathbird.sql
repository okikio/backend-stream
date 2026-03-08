CREATE TABLE "bookmarks" (
	"tmdb_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"meta" jsonb NOT NULL,
	"updated_at" timestamp (0) with time zone NOT NULL,
	"group" text[] DEFAULT '{}' NOT NULL,
	"favorite_episodes" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "bookmarks_tmdb_id_user_id_pk" PRIMARY KEY("tmdb_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_codes" (
	"code" uuid PRIMARY KEY NOT NULL,
	"flow" text NOT NULL,
	"auth_type" varchar(255) NOT NULL,
	"created_at" timestamp (0) with time zone NOT NULL,
	"expires_at" timestamp (0) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"list_id" uuid NOT NULL,
	"tmdb_id" varchar(255) NOT NULL,
	"added_at" timestamp (0) with time zone DEFAULT now() NOT NULL,
	"type" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp (0) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (0) with time zone NOT NULL,
	"public" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tmdb_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"season_id" varchar(255),
	"episode_id" varchar(255),
	"meta" jsonb NOT NULL,
	"updated_at" timestamp (0) with time zone NOT NULL,
	"duration" bigint NOT NULL,
	"watched" bigint NOT NULL,
	"season_number" integer,
	"episode_number" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"created_at" timestamp (0) with time zone NOT NULL,
	"accessed_at" timestamp (0) with time zone NOT NULL,
	"expires_at" timestamp (0) with time zone NOT NULL,
	"device" text NOT NULL,
	"user_agent" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"group_order" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp (0) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (0) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_group_order_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"application_theme" varchar(255),
	"custom_theme" jsonb,
	"application_language" varchar(255),
	"default_subtitle_language" varchar(255),
	"proxy_urls" text[] DEFAULT '{}' NOT NULL,
	"trakt_key" varchar(255),
	"febbox_key" varchar(255),
	"enable_autoplay" boolean DEFAULT true NOT NULL,
	"enable_carousel_view" boolean DEFAULT false NOT NULL,
	"enable_details_modal" boolean DEFAULT false NOT NULL,
	"enable_discover" boolean DEFAULT true NOT NULL,
	"enable_featured" boolean DEFAULT false NOT NULL,
	"enable_image_logos" boolean DEFAULT true NOT NULL,
	"enable_skip_credits" boolean DEFAULT true NOT NULL,
	"enable_source_order" boolean DEFAULT false NOT NULL,
	"enable_thumbnails" boolean DEFAULT false NOT NULL,
	"proxy_tmdb" boolean DEFAULT false NOT NULL,
	"source_order" text[] DEFAULT '{}' NOT NULL,
	"disabled_embeds" text[] DEFAULT '{}' NOT NULL,
	"disabled_sources" text[] DEFAULT '{}' NOT NULL,
	"embed_order" text[] DEFAULT '{}' NOT NULL,
	"enable_double_click_to_seek" boolean DEFAULT false NOT NULL,
	"enable_embed_order" boolean DEFAULT false NOT NULL,
	"enable_hold_to_boost" boolean DEFAULT false NOT NULL,
	"enable_low_performance_mode" boolean DEFAULT false NOT NULL,
	"enable_native_subtitles" boolean DEFAULT false NOT NULL,
	"force_compact_episode_view" boolean DEFAULT false NOT NULL,
	"home_section_order" text[] DEFAULT '{}' NOT NULL,
	"manual_source_selection" boolean DEFAULT false NOT NULL,
	"debrid_service" varchar(255),
	"debrid_token" varchar(255),
	"enable_auto_resume_on_playback_error" boolean DEFAULT false NOT NULL,
	"tidb_key" varchar(255),
	"enable_pause_overlay" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"namespace" varchar(255) NOT NULL,
	"created_at" timestamp (0) with time zone NOT NULL,
	"last_logged_in" timestamp (0) with time zone,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"profile" jsonb NOT NULL,
	"ratings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nickname" varchar(255) NOT NULL,
	CONSTRAINT "users_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "watch_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"tmdb_id" varchar(255) NOT NULL,
	"season_id" varchar(255),
	"episode_id" varchar(255),
	"meta" jsonb NOT NULL,
	"duration" double precision NOT NULL,
	"watched" double precision NOT NULL,
	"watched_at" timestamp (0) with time zone NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"updated_at" timestamp (0) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_list_id_tmdb_id_unique" ON "list_items" USING btree ("list_id","tmdb_id");--> statement-breakpoint
CREATE INDEX "lists_user_id_index" ON "lists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_items_tmdb_id_user_id_season_id_episode_id_unique" ON "progress_items" USING btree ("tmdb_id","user_id","season_id","episode_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE UNIQUE INDEX "watch_history_tmdb_id_user_id_season_id_episode_id_unique" ON "watch_history" USING btree ("tmdb_id","user_id","season_id","episode_id") NULLS NOT DISTINCT;