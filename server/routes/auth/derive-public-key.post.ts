import { z } from 'zod';
import { createPrivateKey, createPublicKey } from 'node:crypto';

const requestSchema = z.object({
  mnemonic: z.string().min(1),
});

function toBase64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// PKCS#8 DER header for an Ed25519 seed (RFC 8410)
const PKCS8_ED25519_HEADER = Buffer.from('302e020100300506032b657004220420', 'hex');

function deriveEd25519PublicKey(seed: Uint8Array): Uint8Array {
  const pkcs8 = Buffer.concat([PKCS8_ED25519_HEADER, Buffer.from(seed)]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);
  // SPKI export: last 32 bytes are the raw Ed25519 public key
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  return new Uint8Array(spki).slice(-32);
}

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid request body' });
  }

  const { mnemonic } = parsed.data;

  // PBKDF2-HMAC-SHA256: 2048 iterations, 32-byte output, salt = "mnemonic"
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(mnemonic),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode('mnemonic'), iterations: 2048, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const seed = new Uint8Array(derivedBits);

  const publicKeyBytes = deriveEd25519PublicKey(seed);
  return { publicKey: toBase64Url(publicKeyBytes) };
});
