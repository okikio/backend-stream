import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, watch_history, eq, and } from '~/utils/db';

const watchHistorySchema = z.object({
  tmdbId: z.string(),
  meta: z.object({ title: z.string(), type: z.string(), year: z.number().optional(), poster: z.string().optional() }),
  duration: z.number().min(0),
  watched: z.number().min(0),
  watchedAt: z.string().datetime({ offset: true }).optional(),
  completed: z.boolean().optional(),
  seasonId: z.string().optional().nullable(),
  episodeId: z.string().optional().nullable(),
  seasonNumber: z.number().optional().nullable(),
  episodeNumber: z.number().optional().nullable(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const tmdbId = event.context.params?.tmdbid;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (event.method === 'PUT') {
    const body = await readBody(event);
    const validated = watchHistorySchema.parse(body);

    if (validated.tmdbId !== tmdbId) {
      throw createError({ statusCode: 400, message: 'body.tmdbId must match the URL parameter' });
    }

    const now = new Date();

    const seasonId = validated.seasonId ?? null;
    const episodeId = validated.episodeId ?? null;

    const [item] = await db
      .insert(watch_history)
      .values({
        id: randomUUID(),
        tmdb_id: tmdbId!,
        user_id: userId!,
        season_id: seasonId,
        episode_id: episodeId,
        season_number: validated.seasonNumber ?? null,
        episode_number: validated.episodeNumber ?? null,
        meta: validated.meta,
        duration: validated.duration,
        watched: validated.watched,
        watched_at: validated.watchedAt ? new Date(validated.watchedAt) : now,
        completed: validated.completed ?? false,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [watch_history.tmdb_id, watch_history.user_id, watch_history.season_id, watch_history.episode_id],
        set: {
          meta: validated.meta,
          duration: validated.duration,
          watched: validated.watched,
          watched_at: validated.watchedAt ? new Date(validated.watchedAt) : now,
          completed: validated.completed ?? false,
          updated_at: now,
        },
      })
      .returning();

    return {
      success: true,
      id: item.id,
      tmdbId: item.tmdb_id,
      userId: item.user_id,
      seasonId: item.season_id,
      episodeId: item.episode_id,
      seasonNumber: item.season_number,
      episodeNumber: item.episode_number,
      meta: item.meta,
      duration: item.duration,
      watched: item.watched,
      watchedAt: item.watched_at,
      completed: item.completed,
      updatedAt: item.updated_at,
    };
  }

  if (event.method === 'DELETE') {
    const deleted = await db
      .delete(watch_history)
      .where(and(eq(watch_history.user_id, userId!), eq(watch_history.tmdb_id, tmdbId!)))
      .returning();
    return { count: deleted.length };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
