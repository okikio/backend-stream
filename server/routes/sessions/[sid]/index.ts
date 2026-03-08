import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { db, sessions, eq } from '~/utils/db';

const updateSessionSchema = z.object({
  deviceName: z.string().max(500).min(1).optional(),
});

export default defineEventHandler(async event => {
  const sessionId = getRouterParam(event, 'sid');
  const currentSession = await useAuth().getCurrentSession();

  const [targetedSession] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId!))
    .limit(1);

  if (!targetedSession) {
    if (event.method === 'DELETE') return { id: sessionId };
    throw createError({ statusCode: 404, message: 'Session cannot be found' });
  }

  if (targetedSession.user !== currentSession.user) {
    throw createError({
      statusCode: 401,
      message:
        event.method === 'DELETE'
          ? 'Cannot delete sessions you do not own'
          : 'Cannot edit sessions other than your own',
    });
  }

  if (event.method === 'PATCH') {
    const body = await readBody(event);
    const validated = updateSessionSchema.parse(body);

    if (validated.deviceName) {
      await db.update(sessions).set({ device: validated.deviceName }).where(eq(sessions.id, sessionId!));
    }

    const [updated] = await db.select().from(sessions).where(eq(sessions.id, sessionId!)).limit(1);
    return {
      id: updated.id,
      user: updated.user,
      createdAt: updated.created_at,
      accessedAt: updated.accessed_at,
      expiresAt: updated.expires_at,
      device: updated.device,
      userAgent: updated.user_agent,
      current: updated.id === currentSession.id,
    };
  }

  if (event.method === 'DELETE') {
    await db.delete(sessions).where(eq(sessions.id, sessionId!));
    return { id: sessionId };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
