import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { useAuth } from '~/utils/auth';
import { randomUUID } from 'node:crypto';
import { generateRandomNickname } from '~/utils/nickname';
import { db, users, eq } from '~/utils/db';

const completeSchema = z.object({
  publicKey: z.string(),
  challenge: z.object({
    code: z.string(),
    signature: z.string(),
  }),
  namespace: z.string().min(1),
  device: z.string().max(500).min(1),
  profile: z.object({
    colorA: z.string(),
    colorB: z.string(),
    icon: z.string(),
  }),
});

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const result = completeSchema.safeParse(body);
  if (!result.success) {
    throw createError({ statusCode: 400, message: 'Invalid request body' });
  }

  const challenge = useChallenge();
  await challenge.verifyChallengeCode(
    body.challenge.code,
    body.publicKey,
    body.challenge.signature,
    'registration',
    'mnemonic',
  );

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.public_key, body.publicKey))
    .limit(1);
  if (existingUser) {
    throw createError({ statusCode: 409, message: 'A user with this public key already exists' });
  }

  const userId = randomUUID();
  const now = new Date();
  const nickname = generateRandomNickname();

  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      namespace: body.namespace,
      public_key: body.publicKey,
      nickname,
      created_at: now,
      last_logged_in: now,
      permissions: [],
      profile: body.profile,
      ratings: [],
    })
    .returning();

  const auth = useAuth();
  const userAgent = getRequestHeader(event, 'user-agent');
  const session = await auth.makeSession(user.id, body.device, userAgent);
  const token = await auth.makeSessionToken(session);

  return {
    user: {
      id: user.id,
      publicKey: user.public_key,
      namespace: user.namespace,
      nickname: user.nickname,
      profile: user.profile,
      permissions: user.permissions,
    },
    session: {
      id: session.id,
      user: session.user,
      createdAt: session.created_at,
      accessedAt: session.accessed_at,
      expiresAt: session.expires_at,
      device: session.device,
      userAgent: session.user_agent,
    },
    token,
  };
});
