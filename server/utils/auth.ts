import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { db, sessions, eq } from './db';

// 21 days in ms
const SESSION_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

function getSecret(): Uint8Array {
  const runtimeConfig = useRuntimeConfig();
  const cryptoSecret = (runtimeConfig.cryptoSecret as string) || process.env.CRYPTO_SECRET;
  if (!cryptoSecret) throw new Error('CRYPTO_SECRET environment variable is not set');
  return new TextEncoder().encode(cryptoSecret);
}

export function useAuth() {
  const getSession = async (id: string) => {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;
    return session;
  };

  const getSessionAndBump = async (id: string) => {
    const session = await getSession(id);
    if (!session) return null;

    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);

    const [updated] = await db
      .update(sessions)
      .set({ accessed_at: now, expires_at: expiryDate })
      .where(eq(sessions.id, id))
      .returning();
    return updated ?? null;
  };

  const makeSession = async (user: string, device: string, userAgent?: string) => {
    if (!userAgent) throw new Error('No useragent provided');

    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);

    const [session] = await db
      .insert(sessions)
      .values({
        id: randomUUID(),
        user,
        device,
        user_agent: userAgent,
        created_at: now,
        accessed_at: now,
        expires_at: expiryDate,
      })
      .returning();
    return session;
  };

  const makeSessionToken = async (session: { id: string }): Promise<string> => {
    return new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(getSecret());
  };

  const verifySessionToken = async (token: string): Promise<{ sid: string } | null> => {
    try {
      const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
      if (typeof payload.sid !== 'string') return null;
      return payload as { sid: string };
    } catch {
      return null;
    }
  };

  const getCurrentSession = async () => {
    const event = useEvent();
    const authHeader = getRequestHeader(event, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    const payload = await verifySessionToken(token);
    if (!payload) {
      throw createError({ statusCode: 401, message: 'Invalid token' });
    }

    const session = await getSessionAndBump(payload.sid);
    if (!session) {
      throw createError({ statusCode: 401, message: 'Session not found or expired' });
    }

    return session;
  };

  return {
    getSession,
    getSessionAndBump,
    makeSession,
    makeSessionToken,
    verifySessionToken,
    getCurrentSession,
  };
}
