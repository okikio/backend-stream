import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const progressMetaSchema = z.object({
  title: z.string(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'tv', 'show']),
  year: z.number().optional(),
});

const progressItemSchema = z.object({
  meta: progressMetaSchema,
  tmdbId: z.string(),
  duration: z.number().transform(Math.round),
  watched: z.number().transform(Math.round),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

// 13th July 2021 - movie-web epoch
const minEpoch = 1626134400000;

const coerceDateTime = (dateTime?: string) => {
  const epoch = dateTime ? new Date(dateTime).getTime() : Date.now();
  return new Date(Math.max(minEpoch, Math.min(epoch, Date.now())));
};

const normalizeIds = (metaType: string, seasonId?: string, episodeId?: string) => ({
  seasonId: metaType === 'movie' ? '\n' : seasonId || null,
  episodeId: metaType === 'movie' ? '\n' : episodeId || null,
});

const formatProgressItem = (item: any) => ({
  id: item.id,
  tmdbId: item.tmdb_id,
  userId: item.user_id,
  seasonId: item.season_id === '\n' ? null : item.season_id,
  episodeId: item.episode_id === '\n' ? null : item.episode_id,
  seasonNumber: item.season_number,
  episodeNumber: item.episode_number,
  meta: item.meta,
  duration: Number(item.duration),
  watched: Number(item.watched),
  updatedAt: item.updated_at,
});

export default defineEventHandler(async (event) => {
  const { id: userId, tmdb_id: tmdbId } = event.context.params!;
  const method = event.method;

  const session = await useAuth().getCurrentSession();
  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Unauthorized' });
  }

  if (method === 'PUT') {
    const body = await readBody(event);
    let parsedBody;
    try {
      parsedBody = progressItemSchema.parse(body);
    } catch (error) {
      throw createError({ statusCode: 400, message: error.message });
    }
    const { meta, tmdbId, duration, watched, seasonId, episodeId, seasonNumber, episodeNumber, updatedAt } = parsedBody;

    const now = coerceDateTime(updatedAt);
    const { seasonId: normSeasonId, episodeId: normEpisodeId } = normalizeIds(meta.type, seasonId, episodeId);

    const existing = await prisma.progress_items.findUnique({
      where: { tmdb_id_user_id_season_id_episode_id: { tmdb_id: tmdbId, user_id: userId, season_id: normSeasonId, episode_id: normEpisodeId } },
    });

    const data = {
      duration: BigInt(duration),
      watched: BigInt(watched),
      meta,
      updated_at: now,
    };

    const progressItem = existing
      ? await prisma.progress_items.update({ where: { id: existing.id }, data })
      : await prisma.progress_items.create({
          data: {
            id: randomUUID(),
            tmdb_id: tmdbId,
            user_id: userId,
            season_id: normSeasonId,
            episode_id: normEpisodeId,
            season_number: seasonNumber || null,
            episode_number: episodeNumber || null,
            ...data,
          },
        });

    return formatProgressItem(progressItem);
  }

  if (method === 'DELETE') {
    const body = await readBody(event).catch(() => ({}));
    const where: any = { user_id: userId, tmdb_id: tmdbId };

    if (body.seasonId) where.season_id = body.seasonId;
    else if (body.meta?.type === 'movie') where.season_id = '\n';

    if (body.episodeId) where.episode_id = body.episodeId;
    else if (body.meta?.type === 'movie') where.episode_id = '\n';

    const items = await prisma.progress_items.findMany({ where });
    if (items.length === 0) return { count: 0, tmdbId, episodeId: body.episodeId, seasonId: body.seasonId };

    await prisma.progress_items.deleteMany({ where });
    return { count: items.length, tmdbId, episodeId: body.episodeId, seasonId: body.seasonId };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
