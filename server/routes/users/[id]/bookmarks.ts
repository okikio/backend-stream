import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { db, bookmarks, eq, and } from '~/utils/db';

const bookmarkMetaSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  poster: z.string().optional(),
  type: z.enum(['movie', 'show']),
});

const bookmarkDataSchema = z.object({
  tmdbId: z.string(),
  meta: bookmarkMetaSchema,
  group: z.union([z.string(), z.array(z.string())]).optional(),
  favoriteEpisodes: z.array(z.string()).optional(),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access other user information' });
  }

  if (event.method === 'GET') {
    const rows = await db.select().from(bookmarks).where(eq(bookmarks.user_id, userId!));
    return rows.map(b => ({
      tmdbId: b.tmdb_id,
      meta: b.meta,
      group: b.group,
      favoriteEpisodes: b.favorite_episodes,
      updatedAt: b.updated_at,
    }));
  }

  if (event.method === 'PUT') {
    const body = await readBody(event);
    const validatedBody = z.array(bookmarkDataSchema).parse(body);

    const now = new Date();
    const results = [];

    for (const item of validatedBody) {
      const normalizedGroup = item.group
        ? Array.isArray(item.group) ? item.group : [item.group]
        : [];
      const normalizedFav = item.favoriteEpisodes ?? [];

      const [bm] = await db
        .insert(bookmarks)
        .values({
          tmdb_id: item.tmdbId,
          user_id: userId!,
          meta: item.meta,
          group: normalizedGroup,
          favorite_episodes: normalizedFav,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [bookmarks.tmdb_id, bookmarks.user_id],
          set: {
            meta: item.meta,
            group: normalizedGroup,
            favorite_episodes: normalizedFav,
            updated_at: now,
          },
        })
        .returning();
      results.push({
        tmdbId: bm.tmdb_id,
        meta: bm.meta,
        group: bm.group,
        favoriteEpisodes: bm.favorite_episodes,
        updatedAt: bm.updated_at,
      });
    }
    return results;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
