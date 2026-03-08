import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { db, users, eq } from '~/utils/db';

const userRatingsSchema = z.object({
  tmdb_id: z.number(),
  type: z.enum(['movie', 'tv']),
  rating: z.number().min(0).max(10),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (event.method === 'GET') {
    const [user] = await db
      .select({ ratings: users.ratings })
      .from(users)
      .where(eq(users.id, userId!))
      .limit(1);
    return { userId, ratings: user?.ratings ?? [] };
  }

  if (event.method === 'POST') {
    const body = await readBody(event);
    const validated = userRatingsSchema.parse(body);

    const [user] = await db
      .select({ ratings: users.ratings })
      .from(users)
      .where(eq(users.id, userId!))
      .limit(1);

    const currentRatings = Array.isArray(user?.ratings) ? (user.ratings as any[]) : [];
    const idx = currentRatings.findIndex(
      (r: any) => r.tmdb_id === validated.tmdb_id && r.type === validated.type,
    );

    const updatedRatings =
      idx >= 0
        ? currentRatings.map((r, i) => (i === idx ? validated : r))
        : [...currentRatings, validated];

    await db.update(users).set({ ratings: updatedRatings }).where(eq(users.id, userId!));
    return { userId, rating: validated };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
