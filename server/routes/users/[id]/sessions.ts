import { useAuth } from '~/utils/auth';
import { db, sessions, eq } from '~/utils/db';

export default defineEventHandler(async event => {
  const userId = getRouterParam(event, 'id');
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Cannot access sessions for other users' });
  }

  const rows = await db.select().from(sessions).where(eq(sessions.user, userId!));
  return rows.map(s => ({
    id: s.id,
    userId: s.user,
    createdAt: s.created_at.toISOString(),
    accessedAt: s.accessed_at.toISOString(),
    device: s.device,
    userAgent: s.user_agent,
  }));
});
