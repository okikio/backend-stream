import { randomUUID } from 'node:crypto';
import { db, challenge_codes, eq } from './db';

// Challenge code expires in 10 minutes
const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

// ─── Ed25519 verification via Web Crypto (Node.js 22+ / stable) ───────────────
function fromBase64Url(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

async function verifyEd25519(
  data: string,
  publicKeyB64: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const pubKeyBytes = fromBase64Url(publicKeyB64);
    const sigBytes = fromBase64Url(signatureB64);
    const msgBytes = new TextEncoder().encode(data);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      pubKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    return await crypto.subtle.verify({ name: 'Ed25519' }, cryptoKey, sigBytes, msgBytes);
  } catch {
    return false;
  }
}

export function useChallenge() {
  const createChallengeCode = async (flow: string, authType: string) => {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);

    const [code] = await db
      .insert(challenge_codes)
      .values({
        code: randomUUID(),
        flow,
        auth_type: authType,
        created_at: now,
        expires_at: expiryDate,
      })
      .returning();
    return code;
  };

  const verifyChallengeCode = async (
    code: string,
    publicKey: string,
    signature: string,
    flow: string,
    authType: string,
  ) => {
    const [challengeCode] = await db
      .select()
      .from(challenge_codes)
      .where(eq(challenge_codes.code, code))
      .limit(1);

    if (!challengeCode) throw new Error('Invalid challenge code');
    if (challengeCode.flow !== flow || challengeCode.auth_type !== authType)
      throw new Error('Invalid challenge flow or auth type');
    if (new Date(challengeCode.expires_at) < new Date()) throw new Error('Challenge code expired');

    const valid = await verifyEd25519(code, publicKey, signature);
    if (!valid) throw new Error('Invalid signature');

    await db.delete(challenge_codes).where(eq(challenge_codes.code, code));
    return true;
  };

  return { createChallengeCode, verifyChallengeCode };
}
