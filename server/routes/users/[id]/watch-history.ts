import { useAuth } from '~/utils/auth';
import { db, watch_history, eq } from '~/utils/db';

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (event.method === 'GET') {
    const items = await db
      .select()
      .from(watch_history)
      .where(eq(watch_history.user_id, userId!));

    return items.map(h => ({
      tmdbId: h.tmdb_id,
      meta: h.meta,
      duration: h.duration,
      watched: h.watched,
      watchedAt: h.watched_at,
      completed: h.completed,
      seasonId: h.season_id || undefined,
      episodeId: h.episode_id || undefined,
      seasonNumber: h.season_number,
      episodeNumber: h.episode_number,
    }));
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
