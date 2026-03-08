import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { db, bookmarks, eq, and } from '~/utils/db';

const bookmarkDataSchema = z.object({
  meta: z.object({
    title: z.string(),
    year: z.number().optional(),
    poster: z.string().optional(),
    type: z.enum(['movie', 'show']),
  }),
  group: z.union([z.string(), z.array(z.string())]).optional(),
  favoriteEpisodes: z.array(z.string()).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const tmdbId = event.context.params?.tmdbid;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  const where = and(eq(bookmarks.tmdb_id, tmdbId!), eq(bookmarks.user_id, userId!));

  if (event.method === 'GET') {
    const [bm] = await db.select().from(bookmarks).where(where).limit(1);
    if (!bm) throw createError({ statusCode: 404, message: 'Bookmark not found' });
    return { tmdbId: bm.tmdb_id, meta: bm.meta, group: bm.group, favoriteEpisodes: bm.favorite_episodes };
  }

  if (event.method === 'POST') {
    const body = await readBody(event);
    const validated = bookmarkDataSchema.parse(body);
    const normalizedGroup = validated.group
      ? Array.isArray(validated.group) ? validated.group : [validated.group]
      : [];
    const now = new Date();

    const [bm] = await db
      .insert(bookmarks)
      .values({
        tmdb_id: tmdbId!,
        user_id: userId!,
        meta: validated.meta,
        group: normalizedGroup,
        favorite_episodes: validated.favoriteEpisodes ?? [],
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [bookmarks.tmdb_id, bookmarks.user_id],
        set: {
          meta: validated.meta,
          group: normalizedGroup,
          favorite_episodes: validated.favoriteEpisodes ?? [],
          updated_at: now,
        },
      })
      .returning();
    return { tmdbId: bm.tmdb_id, meta: bm.meta, group: bm.group, favoriteEpisodes: bm.favorite_episodes };
  }

  if (event.method === 'DELETE') {
    await db.delete(bookmarks).where(where);
    return { success: true };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
