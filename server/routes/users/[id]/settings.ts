import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';
import { db, user_settings, eq } from '~/utils/db';

const log = scopedLogger('user-settings');

const settingsSchema = z.object({
  applicationTheme: z.string().nullable().optional(),
  customTheme: z.any().optional(),
  applicationLanguage: z.string().nullable().optional(),
  defaultSubtitleLanguage: z.string().nullable().optional(),
  proxyUrls: z.array(z.string()).nullable().optional(),
  traktKey: z.string().nullable().optional(),
  febboxKey: z.string().nullable().optional(),
  enableAutoplay: z.boolean().optional(),
  enableCarouselView: z.boolean().optional(),
  enableDetailsModal: z.boolean().optional(),
  enableDiscover: z.boolean().optional(),
  enableFeatured: z.boolean().optional(),
  enableImageLogos: z.boolean().optional(),
  enableSkipCredits: z.boolean().optional(),
  enableSourceOrder: z.boolean().optional(),
  enableThumbnails: z.boolean().optional(),
  proxyTmdb: z.boolean().optional(),
  sourceOrder: z.array(z.string()).optional(),
  disabledEmbeds: z.array(z.string()).optional(),
  disabledSources: z.array(z.string()).optional(),
  embedOrder: z.array(z.string()).optional(),
  enableDoubleClickToSeek: z.boolean().optional(),
  enableEmbedOrder: z.boolean().optional(),
  enableHoldToBoost: z.boolean().optional(),
  enableLowPerformanceMode: z.boolean().optional(),
  enableNativeSubtitles: z.boolean().optional(),
  forceCompactEpisodeView: z.boolean().optional(),
  homeSectionOrder: z.array(z.string()).optional(),
  manualSourceSelection: z.boolean().optional(),
  debridService: z.string().nullable().optional(),
  debridToken: z.string().nullable().optional(),
  enableAutoResumeOnPlaybackError: z.boolean().optional(),
  tidbKey: z.string().nullable().optional(),
  enablePauseOverlay: z.boolean().optional(),
});

function toRow(s: typeof settingsSchema._output) {
  const row: Record<string, unknown> = {};
  if (s.applicationTheme !== undefined) row.application_theme = s.applicationTheme;
  if (s.customTheme !== undefined) row.custom_theme = s.customTheme;
  if (s.applicationLanguage !== undefined) row.application_language = s.applicationLanguage;
  if (s.defaultSubtitleLanguage !== undefined) row.default_subtitle_language = s.defaultSubtitleLanguage;
  if (s.proxyUrls !== undefined) row.proxy_urls = s.proxyUrls ?? [];
  if (s.traktKey !== undefined) row.trakt_key = s.traktKey;
  if (s.febboxKey !== undefined) row.febbox_key = s.febboxKey;
  if (s.enableAutoplay !== undefined) row.enable_autoplay = s.enableAutoplay;
  if (s.enableCarouselView !== undefined) row.enable_carousel_view = s.enableCarouselView;
  if (s.enableDetailsModal !== undefined) row.enable_details_modal = s.enableDetailsModal;
  if (s.enableDiscover !== undefined) row.enable_discover = s.enableDiscover;
  if (s.enableFeatured !== undefined) row.enable_featured = s.enableFeatured;
  if (s.enableImageLogos !== undefined) row.enable_image_logos = s.enableImageLogos;
  if (s.enableSkipCredits !== undefined) row.enable_skip_credits = s.enableSkipCredits;
  if (s.enableSourceOrder !== undefined) row.enable_source_order = s.enableSourceOrder;
  if (s.enableThumbnails !== undefined) row.enable_thumbnails = s.enableThumbnails;
  if (s.proxyTmdb !== undefined) row.proxy_tmdb = s.proxyTmdb;
  if (s.sourceOrder !== undefined) row.source_order = s.sourceOrder;
  if (s.disabledEmbeds !== undefined) row.disabled_embeds = s.disabledEmbeds;
  if (s.disabledSources !== undefined) row.disabled_sources = s.disabledSources;
  if (s.embedOrder !== undefined) row.embed_order = s.embedOrder;
  if (s.enableDoubleClickToSeek !== undefined) row.enable_double_click_to_seek = s.enableDoubleClickToSeek;
  if (s.enableEmbedOrder !== undefined) row.enable_embed_order = s.enableEmbedOrder;
  if (s.enableHoldToBoost !== undefined) row.enable_hold_to_boost = s.enableHoldToBoost;
  if (s.enableLowPerformanceMode !== undefined) row.enable_low_performance_mode = s.enableLowPerformanceMode;
  if (s.enableNativeSubtitles !== undefined) row.enable_native_subtitles = s.enableNativeSubtitles;
  if (s.forceCompactEpisodeView !== undefined) row.force_compact_episode_view = s.forceCompactEpisodeView;
  if (s.homeSectionOrder !== undefined) row.home_section_order = s.homeSectionOrder;
  if (s.manualSourceSelection !== undefined) row.manual_source_selection = s.manualSourceSelection;
  if (s.debridService !== undefined) row.debrid_service = s.debridService;
  if (s.debridToken !== undefined) row.debrid_token = s.debridToken;
  if (s.enableAutoResumeOnPlaybackError !== undefined) row.enable_auto_resume_on_playback_error = s.enableAutoResumeOnPlaybackError;
  if (s.tidbKey !== undefined) row.tidb_key = s.tidbKey;
  if (s.enablePauseOverlay !== undefined) row.enable_pause_overlay = s.enablePauseOverlay;
  return row;
}

function toResponse(row: typeof user_settings.$inferSelect) {
  return {
    id: row.id,
    applicationTheme: row.application_theme,
    customTheme: row.custom_theme,
    applicationLanguage: row.application_language,
    defaultSubtitleLanguage: row.default_subtitle_language,
    proxyUrls: row.proxy_urls,
    traktKey: row.trakt_key,
    febboxKey: row.febbox_key,
    debridToken: row.debrid_token,
    debridService: row.debrid_service,
    tidbKey: row.tidb_key,
    enableThumbnails: row.enable_thumbnails,
    enableAutoplay: row.enable_autoplay,
    enableSkipCredits: row.enable_skip_credits,
    enableDiscover: row.enable_discover,
    enableFeatured: row.enable_featured,
    enableDetailsModal: row.enable_details_modal,
    enableImageLogos: row.enable_image_logos,
    enableCarouselView: row.enable_carousel_view,
    forceCompactEpisodeView: row.force_compact_episode_view,
    sourceOrder: row.source_order,
    enableSourceOrder: row.enable_source_order,
    disabledSources: row.disabled_sources,
    embedOrder: row.embed_order,
    enableEmbedOrder: row.enable_embed_order,
    disabledEmbeds: row.disabled_embeds,
    proxyTmdb: row.proxy_tmdb,
    enableLowPerformanceMode: row.enable_low_performance_mode,
    enableNativeSubtitles: row.enable_native_subtitles,
    enableHoldToBoost: row.enable_hold_to_boost,
    homeSectionOrder: row.home_section_order,
    manualSourceSelection: row.manual_source_selection,
    enableDoubleClickToSeek: row.enable_double_click_to_seek,
    enableAutoResumeOnPlaybackError: row.enable_auto_resume_on_playback_error,
    enablePauseOverlay: row.enable_pause_overlay,
  };
}

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (event.method === 'GET') {
    try {
      const [settings] = await db
        .select()
        .from(user_settings)
        .where(eq(user_settings.id, userId!))
        .limit(1);

      if (!settings) {
        // Return defaults when no settings row exists yet
        const defaults = await db
          .insert(user_settings)
          .values({ id: userId! })
          .returning();
        return toResponse(defaults[0]);
      }
      return toResponse(settings);
    } catch (error) {
      log.error('Failed to get user settings', { userId, error: String(error) });
      throw createError({ statusCode: 500, message: 'Failed to get user settings' });
    }
  }

  if (event.method === 'PUT') {
    try {
      const body = await readBody(event);
      log.info('Updating user settings', { userId, body });

      const validated = settingsSchema.parse(body);
      const row = toRow(validated);

      const [settings] = await db
        .insert(user_settings)
        .values({ id: userId!, ...row })
        .onConflictDoUpdate({ target: user_settings.id, set: row })
        .returning();

      log.info('User settings updated successfully', { userId });
      return toResponse(settings);
    } catch (error) {
      log.error('Failed to update user settings', { userId, error: String(error) });
      if (error instanceof z.ZodError) {
        throw createError({ statusCode: 400, message: 'Invalid settings data' });
      }
      throw createError({ statusCode: 500, message: 'Failed to update user settings' });
    }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
