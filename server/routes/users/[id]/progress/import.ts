import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { scopedLogger } from '~/utils/logger';
import { db, progress_items, users, eq, and } from '~/utils/db';

const log = scopedLogger('progress-import');

const progressMetaSchema = z.object({
  title: z.string(),
  type: z.enum(['movie', 'show']),
  year: z.number().optional(),
  poster: z.string().optional(),
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string().transform(val => val || randomUUID()),
  duration: z.number().min(0).transform(n => Math.round(n)),
  watched: z.number().min(0).transform(n => Math.round(n)),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

const minEpoch = 1626134400000; // 13th July 2021

function coerceDateTime(dt: string | undefined) {
  const epoch = dt ? new Date(dt).getTime() : Date.now();
  return new Date(Math.max(minEpoch, Math.min(epoch, Date.now())));
}

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot modify user other than yourself' });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId!)).limit(1);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  if (event.method !== 'PUT') {
    throw createError({ statusCode: 405, message: 'Method not allowed' });
  }

  try {
    const body = await readBody(event);
    const validatedBody = z.array(progressItemSchema).parse(body);

    const existingItems = await db
      .select()
      .from(progress_items)
      .where(eq(progress_items.user_id, userId!));

    const results = [];

    for (const item of validatedBody) {
      const isMovie = item.meta.type === 'movie';
      const seasonId = isMovie ? null : (item.seasonId ?? null);
      const episodeId = isMovie ? null : (item.episodeId ?? null);

      const existing = existingItems.find(
        e =>
          e.tmdb_id === item.tmdbId &&
          e.season_id === seasonId &&
          e.episode_id === episodeId,
      );

      if (existing && Number(existing.watched) >= item.watched) continue;

      const upserted = await db
        .insert(progress_items)
        .values({
          id: existing?.id ?? randomUUID(),
          tmdb_id: item.tmdbId,
          user_id: userId!,
          season_id: seasonId,
          episode_id: episodeId,
          season_number: isMovie ? null : (item.seasonNumber ?? null),
          episode_number: isMovie ? null : (item.episodeNumber ?? null),
          meta: item.meta,
          duration: BigInt(item.duration),
          watched: BigInt(item.watched),
          updated_at: coerceDateTime(item.updatedAt),
        })
        .onConflictDoUpdate({
          target: [progress_items.tmdb_id, progress_items.user_id, progress_items.season_id, progress_items.episode_id],
          set: {
            meta: item.meta,
            duration: BigInt(item.duration),
            watched: BigInt(item.watched),
            updated_at: coerceDateTime(item.updatedAt),
          },
        })
        .returning();

      if (upserted[0]) {
        const r = upserted[0];
        results.push({
          id: r.id,
          tmdbId: r.tmdb_id,
          episode: { id: r.episode_id, number: r.episode_number },
          season: { id: r.season_id, number: r.season_number },
          meta: r.meta,
          duration: Number(r.duration).toString(),
          watched: Number(r.watched).toString(),
          updatedAt: r.updated_at?.toISOString(),
        });
      }
    }

    return results;
  } catch (error) {
    log.error('Failed to import progress', { userId, error: String(error) });
    if (error instanceof z.ZodError) {
      throw createError({ statusCode: 400, message: 'Invalid progress data', cause: error.issues });
    }
    throw createError({ statusCode: 500, message: 'Failed to import progress' });
  }
});
