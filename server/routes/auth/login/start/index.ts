import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { db, users, eq } from '~/utils/db';

const startSchema = z.object({
  publicKey: z.string(),
});

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const result = startSchema.safeParse(body);
  if (!result.success) {
    throw createError({ statusCode: 400, message: 'Invalid request body' });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.public_key, body.publicKey))
    .limit(1);
  if (!user) {
    throw createError({ statusCode: 401, message: 'User cannot be found' });
  }

  const challenge = useChallenge();
  const challengeCode = await challenge.createChallengeCode('login', 'mnemonic');
  return { challenge: challengeCode.code };
});
