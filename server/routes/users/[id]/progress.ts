import { useAuth } from '~/utils/auth';
import { db, progress_items, eq } from '~/utils/db';

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (event.method === 'GET') {
    const items = await db
      .select()
      .from(progress_items)
      .where(eq(progress_items.user_id, userId!));

    return items.map(p => ({
      tmdbId: p.tmdb_id,
      seasonId: p.season_id,
      episodeId: p.episode_id,
      seasonNumber: p.season_number,
      episodeNumber: p.episode_number,
      meta: p.meta,
      duration: Number(p.duration),
      watched: Number(p.watched),
      updatedAt: p.updated_at,
    }));
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
