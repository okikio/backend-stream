import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, progress_items, eq, and } from '~/utils/db';

const progressItemSchema = z.object({
  tmdbId: z.string(),
  meta: z.object({ title: z.string(), type: z.string(), year: z.number().optional(), poster: z.string().optional() }),
  duration: z.number().min(0),
  watched: z.number().min(0),
  seasonId: z.string().optional().nullable(),
  episodeId: z.string().optional().nullable(),
  seasonNumber: z.number().optional().nullable(),
  episodeNumber: z.number().optional().nullable(),
  updatedAt: z.string().optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const tmdbId = event.context.params?.tmdb_id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (event.method === 'PUT') {
    const body = await readBody(event);
    const validated = progressItemSchema.parse(body);
    const now = validated.updatedAt ? new Date(validated.updatedAt) : new Date();

    const duration = BigInt(Math.round(validated.duration));
    const watched = BigInt(Math.round(validated.watched));

    const [item] = await db
      .insert(progress_items)
      .values({
        id: randomUUID(),
        tmdb_id: tmdbId!,
        user_id: userId!,
        season_id: validated.seasonId ?? null,
        episode_id: validated.episodeId ?? null,
        season_number: validated.seasonNumber ?? null,
        episode_number: validated.episodeNumber ?? null,
        meta: validated.meta,
        duration,
        watched,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [progress_items.tmdb_id, progress_items.user_id, progress_items.season_id, progress_items.episode_id],
        set: { meta: validated.meta, duration, watched, updated_at: now },
      })
      .returning();

    return {
      id: item.id,
      tmdbId: item.tmdb_id,
      seasonId: item.season_id,
      episodeId: item.episode_id,
      seasonNumber: item.season_number,
      episodeNumber: item.episode_number,
      meta: item.meta,
      duration: Number(item.duration),
      watched: Number(item.watched),
      updatedAt: item.updated_at,
    };
  }

  if (event.method === 'DELETE') {
    const body = await readBody(event).catch(() => ({}));
    const meta = body?.meta;

    if (meta?.type === 'show') {
      // Delete all episodes for this show
      const deleted = await db
        .delete(progress_items)
        .where(and(eq(progress_items.user_id, userId!), eq(progress_items.tmdb_id, tmdbId!)))
        .returning();
      return { count: deleted.length };
    }

    // Delete specific item (movie or single episode)
    const seasonId = body?.seasonId ?? null;
    const episodeId = body?.episodeId ?? null;

    const deleted = await db
      .delete(progress_items)
      .where(
        and(
          eq(progress_items.user_id, userId!),
          eq(progress_items.tmdb_id, tmdbId!),
          seasonId ? eq(progress_items.season_id, seasonId) : eq(progress_items.tmdb_id, tmdbId!),
        ),
      )
      .returning();
    return { count: deleted.length };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
