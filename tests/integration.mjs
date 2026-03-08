/**
 * Integration test suite for the p-stream backend.
 *
 * Exercises every major API surface so CI can give a confident answer to
 * "does this PR actually work?".
 *
 * Uses only Node.js built-in modules — zero external dependencies.
 *
 * Usage:
 *   node tests/integration.mjs [BASE_URL]
 *
 * BASE_URL defaults to http://localhost:3000
 *
 * Exit code 0 = all tests passed
 * Exit code 1 = one or more tests failed
 */

import { createPrivateKey, createPublicKey, sign as nodeSign } from 'node:crypto';

const BASE = process.argv[2] ?? 'http://localhost:3000';

// ─── tiny test framework ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` (${detail})` : ''}`);
    failed++;
    failures.push(label);
  }
}

async function section(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    await fn();
  } catch (err) {
    console.log(`  💥 Uncaught error: ${err.message}`);
    failed++;
    failures.push(`${name} (uncaught: ${err.message})`);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function api(path, options = {}) {
  const { headers: extraHeaders, body, ...rest } = options;
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    ...rest,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

// ─── Ed25519 key pair (random per run, no external deps) ─────────────────────

// PKCS#8 DER header for Ed25519 seed key (RFC 8410)
const PKCS8_ED25519_HEADER = Buffer.from('302e020100300506032b657004220420', 'hex');

const seed = crypto.getRandomValues(new Uint8Array(32));
const pkcs8Der = Buffer.concat([PKCS8_ED25519_HEADER, Buffer.from(seed)]);
const testPrivateKey = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
const testPublicKeyObj = createPublicKey(testPrivateKey);
const spki = testPublicKeyObj.export({ type: 'spki', format: 'der' });
const rawPublicKey = Buffer.from(spki).slice(-32);
const publicKeyB64 = toBase64Url(rawPublicKey);

/** Sign a challenge string with the test private key, returns base64url */
function signChallenge(challenge) {
  // null algorithm = raw EdDSA (Ed25519) in Node.js crypto
  const sig = nodeSign(null, Buffer.from(challenge), testPrivateKey);
  return toBase64Url(sig);
}

// ─── test data ────────────────────────────────────────────────────────────────

const TEST_NAMESPACE  = 'integration-test';
const TEST_MOVIE_TMDB = 'movie-550';   // Fight Club
const TEST_SHOW_TMDB  = 'tv-1399';     // Game of Thrones
const TEST_SEASON_ID  = 'season-1';
const TEST_EPISODE_ID = 'episode-1';

// ─── shared state across sections ────────────────────────────────────────────

let authToken = null;
let userId    = null;

// ══════════════════════════════════════════════════════════════════════════════
// 1. HEALTH / PUBLIC ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

await section('Health & public endpoints', async () => {
  const root = await api('/');
  assert('GET / returns 200', root.status === 200);
  assert('GET / body contains "Backend is working"',
    typeof root.json?.message === 'string' && root.json.message.includes('Backend is working'));

  const meta = await api('/meta');
  assert('GET /meta returns 200', meta.status === 200);
  assert('GET /meta has name field',    typeof meta.json?.name === 'string');
  assert('GET /meta has version field', typeof meta.json?.version === 'string');
  assert('GET /meta has description',   typeof meta.json?.description === 'string');
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. REGISTRATION FLOW
// ══════════════════════════════════════════════════════════════════════════════

await section('Registration flow', async () => {
  const startRes = await api('/auth/register/start', { method: 'POST', body: {} });
  assert('POST /auth/register/start returns 200', startRes.status === 200);
  const challengeCode = startRes.json?.challenge;
  assert('Registration challenge is a non-empty string',
    typeof challengeCode === 'string' && challengeCode.length > 0);
  if (!challengeCode) return;

  const sig = signChallenge(challengeCode);

  const completeRes = await api('/auth/register/complete', {
    method: 'POST',
    headers: { 'User-Agent': 'integration-test/1.0' },
    body: {
      publicKey: publicKeyB64,
      challenge: { code: challengeCode, signature: sig },
      namespace: TEST_NAMESPACE,
      device: 'CI-Integration-Test',
      profile: { colorA: '#FF0000', colorB: '#00FF00', icon: 'user' },
    },
  });
  assert('POST /auth/register/complete returns 200',
    completeRes.status === 200, `got ${completeRes.status}: ${JSON.stringify(completeRes.json)}`);
  assert('Registration returns user object',  !!completeRes.json?.user?.id);
  assert('Registration returns JWT token',    typeof completeRes.json?.token === 'string');
  assert('Registration returns session',      !!completeRes.json?.session?.id);
  assert('User has a non-empty nickname',
    typeof completeRes.json?.user?.nickname === 'string' && completeRes.json.user.nickname.length > 0);
  assert('User has correct namespace',        completeRes.json?.user?.namespace === TEST_NAMESPACE);

  authToken = completeRes.json?.token  ?? null;
  userId    = completeRes.json?.user?.id ?? null;

  // Duplicate registration must be rejected
  const start2  = await api('/auth/register/start', { method: 'POST', body: {} });
  const sig2    = signChallenge(start2.json.challenge);
  const dupRes  = await api('/auth/register/complete', {
    method: 'POST',
    headers: { 'User-Agent': 'integration-test/1.0' },
    body: {
      publicKey: publicKeyB64,
      challenge: { code: start2.json.challenge, signature: sig2 },
      namespace: TEST_NAMESPACE,
      device: 'CI-Dup-Test',
      profile: { colorA: '#000', colorB: '#FFF', icon: 'user' },
    },
  });
  assert('Duplicate registration returns 409', dupRes.status === 409);
});

if (!authToken || !userId) {
  console.log('\n⚠️  Registration failed — skipping authenticated tests');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. LOGIN FLOW
// ══════════════════════════════════════════════════════════════════════════════

await section('Login flow', async () => {
  const loginStart = await api('/auth/login/start', {
    method: 'POST',
    body: { publicKey: publicKeyB64 },
  });
  assert('POST /auth/login/start returns 200', loginStart.status === 200);
  const loginChallenge = loginStart.json?.challenge;
  assert('Login challenge is present', typeof loginChallenge === 'string' && loginChallenge.length > 0);
  if (!loginChallenge) return;

  const loginSig = signChallenge(loginChallenge);
  const loginComplete = await api('/auth/login/complete', {
    method: 'POST',
    headers: { 'User-Agent': 'integration-test/1.0' },
    body: {
      publicKey: publicKeyB64,
      challenge: { code: loginChallenge, signature: loginSig },
      device: 'CI-Login-Test',
    },
  });
  assert('POST /auth/login/complete returns 200',
    loginComplete.status === 200, `got ${loginComplete.status}: ${JSON.stringify(loginComplete.json)}`);
  assert('Login returns user',          !!loginComplete.json?.user?.id);
  assert('Login returns JWT token',     typeof loginComplete.json?.token === 'string');
  assert('Login user ID matches',       loginComplete.json?.user?.id === userId);
});

const auth = { Authorization: 'Bearer ' + authToken };

// ══════════════════════════════════════════════════════════════════════════════
// 4. USER PROFILE
// ══════════════════════════════════════════════════════════════════════════════

await section('User profile', async () => {
  const meRes = await api('/users/@me', { headers: auth });
  assert('GET /users/@me returns 200',       meRes.status === 200);
  assert('GET /users/@me has user object',   !!meRes.json?.user?.id);
  assert('GET /users/@me user ID correct',   meRes.json?.user?.id === userId);
  assert('GET /users/@me has session',       !!meRes.json?.session?.id);
  assert('GET /users/@me user has nickname', typeof meRes.json?.user?.nickname === 'string');

  const patchNick = await api(`/users/${userId}`, {
    method: 'PATCH',
    headers: { ...auth, 'User-Agent': 'integration-test/1.0' },
    body: { nickname: 'IntegrationTester' },
  });
  assert('PATCH /users/:id returns 200',   patchNick.status === 200,
    `got ${patchNick.status}: ${JSON.stringify(patchNick.json)}`);
  assert('Nickname is updated',            patchNick.json?.nickname === 'IntegrationTester');

  const patchProfile = await api(`/users/${userId}`, {
    method: 'PATCH',
    headers: { ...auth, 'User-Agent': 'integration-test/1.0' },
    body: { profile: { colorA: '#AABBCC', colorB: '#DDEEFF', icon: 'star' } },
  });
  assert('PATCH profile returns 200',   patchProfile.status === 200);
  assert('Profile colorA updated',      patchProfile.json?.profile?.colorA === '#AABBCC');
  assert('Profile icon updated',        patchProfile.json?.profile?.icon === 'star');

  const unauth = await api('/users/@me');
  assert('GET /users/@me without token → 401', unauth.status === 401);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

await section('User settings', async () => {
  const getRes = await api(`/users/${userId}/settings`, { headers: auth });
  assert('GET /users/:id/settings returns 200', getRes.status === 200);
  assert('Settings has enableAutoplay field', 'enableAutoplay' in (getRes.json ?? {}));

  const putStd = await api(`/users/${userId}/settings`, {
    method: 'PUT',
    headers: auth,
    body: { applicationTheme: 'dark', applicationLanguage: 'en', enableThumbnails: true, enableAutoplay: false },
  });
  assert('PUT /users/:id/settings returns 200',  putStd.status === 200,
    `got ${putStd.status}: ${JSON.stringify(putStd.json)}`);
  assert('applicationTheme persisted',         putStd.json?.applicationTheme === 'dark');
  assert('enableAutoplay persisted as false',  putStd.json?.enableAutoplay === false);
  assert('enableThumbnails persisted as true', putStd.json?.enableThumbnails === true);

  const putNew = await api(`/users/${userId}/settings`, {
    method: 'PUT',
    headers: auth,
    body: {
      customTheme: { primary: '#111111', secondary: '#222222', tertiary: '#333333' },
      tidbKey: 'my-tidb-key',
      enablePauseOverlay: true,
      debridToken: 'my-debrid-token',
      debridService: 'real-debrid',
    },
  });
  assert('PUT new p-stream fields returns 200',  putNew.status === 200);
  assert('customTheme.primary persisted',        putNew.json?.customTheme?.primary === '#111111');
  assert('tidbKey persisted',                    putNew.json?.tidbKey === 'my-tidb-key');
  assert('enablePauseOverlay persisted as true', putNew.json?.enablePauseOverlay === true);
  assert('debridToken persisted',                putNew.json?.debridToken === 'my-debrid-token');

  const getAgain = await api(`/users/${userId}/settings`, { headers: auth });
  assert('GET after PUT reflects enablePauseOverlay', getAgain.json?.enablePauseOverlay === true);
  assert('GET after PUT reflects customTheme',        getAgain.json?.customTheme?.secondary === '#222222');
  assert('GET after PUT reflects tidbKey',            getAgain.json?.tidbKey === 'my-tidb-key');
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. BOOKMARKS
// ══════════════════════════════════════════════════════════════════════════════

await section('Bookmarks', async () => {
  const emptyGet = await api(`/users/${userId}/bookmarks`, { headers: auth });
  assert('GET /users/:id/bookmarks returns 200', emptyGet.status === 200);
  assert('Bookmarks are initially empty',
    Array.isArray(emptyGet.json) && emptyGet.json.length === 0,
    `got: ${JSON.stringify(emptyGet.json)}`);

  const bulkPut = await api(`/users/${userId}/bookmarks`, {
    method: 'PUT', headers: auth,
    body: [
      { tmdbId: TEST_MOVIE_TMDB, meta: { title: 'Fight Club', year: 1999, type: 'movie' }, group: ['favorites'], favoriteEpisodes: [] },
      { tmdbId: TEST_SHOW_TMDB,  meta: { title: 'Game of Thrones', year: 2011, type: 'show' }, group: ['watching'], favoriteEpisodes: ['s01e01'] },
    ],
  });
  assert('PUT /users/:id/bookmarks returns 200', bulkPut.status === 200,
    `got ${bulkPut.status}: ${JSON.stringify(bulkPut.json)}`);
  assert('Bulk PUT returns 2 items', Array.isArray(bulkPut.json) && bulkPut.json.length === 2);

  const getAfterPut = await api(`/users/${userId}/bookmarks`, { headers: auth });
  assert('GET after bulk PUT returns 2 bookmarks',
    Array.isArray(getAfterPut.json) && getAfterPut.json.length === 2);
  const movieBm = Array.isArray(getAfterPut.json)
    ? getAfterPut.json.find(b => b.tmdbId === TEST_MOVIE_TMDB) : null;
  assert('Movie bookmark has group', Array.isArray(movieBm?.group));

  const singlePost = await api(`/users/${userId}/bookmarks/${TEST_MOVIE_TMDB}`, {
    method: 'POST', headers: auth,
    body: { meta: { title: 'Fight Club', year: 1999, type: 'movie' }, group: ['favorites', 'classics'], favoriteEpisodes: [] },
  });
  assert('POST single bookmark returns 200', singlePost.status === 200);
  assert('Upserted bookmark has 2 groups', Array.isArray(singlePost.json?.group) && singlePost.json.group.length === 2);

  const delRes = await api(`/users/${userId}/bookmarks/${TEST_MOVIE_TMDB}`, { method: 'DELETE', headers: auth });
  assert('DELETE single bookmark returns 200', delRes.status === 200);

  const getAfterDel = await api(`/users/${userId}/bookmarks`, { headers: auth });
  assert('Movie bookmark gone after delete',
    Array.isArray(getAfterDel.json) && !getAfterDel.json.find(b => b.tmdbId === TEST_MOVIE_TMDB));
  assert('Show bookmark still present',
    Array.isArray(getAfterDel.json) && !!getAfterDel.json.find(b => b.tmdbId === TEST_SHOW_TMDB));
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. PROGRESS
// ══════════════════════════════════════════════════════════════════════════════

await section('Progress tracking', async () => {
  const emptyGet = await api(`/users/${userId}/progress`, { headers: auth });
  assert('GET /users/:id/progress returns 200', emptyGet.status === 200);
  assert('Progress is initially empty',
    Array.isArray(emptyGet.json) && emptyGet.json.length === 0);

  const putMovie = await api(`/users/${userId}/progress/${TEST_MOVIE_TMDB}`, {
    method: 'PUT', headers: auth,
    body: { tmdbId: TEST_MOVIE_TMDB, meta: { title: 'Fight Club', year: 1999, type: 'movie' }, duration: 9000, watched: 4500 },
  });
  assert('PUT movie progress returns 200', putMovie.status === 200,
    `got ${putMovie.status}: ${JSON.stringify(putMovie.json)}`);
  assert('Movie progress has tmdbId',  putMovie.json?.tmdbId === TEST_MOVIE_TMDB);
  assert('Movie progress has duration', Number(putMovie.json?.duration) === 9000);
  assert('Movie progress has id',       typeof putMovie.json?.id === 'string');

  const putShow = await api(`/users/${userId}/progress/${TEST_SHOW_TMDB}`, {
    method: 'PUT', headers: auth,
    body: { tmdbId: TEST_SHOW_TMDB, meta: { title: 'GoT', year: 2011, type: 'show' }, duration: 3600, watched: 1800, seasonId: TEST_SEASON_ID, episodeId: TEST_EPISODE_ID, seasonNumber: 1, episodeNumber: 1 },
  });
  assert('PUT show progress returns 200', putShow.status === 200);
  assert('Show progress has seasonId',    putShow.json?.seasonId === TEST_SEASON_ID);

  const getAfter = await api(`/users/${userId}/progress`, { headers: auth });
  assert('GET progress has ≥1 item', Array.isArray(getAfter.json) && getAfter.json.length >= 1);

  const rePut = await api(`/users/${userId}/progress/${TEST_MOVIE_TMDB}`, {
    method: 'PUT', headers: auth,
    body: { tmdbId: TEST_MOVIE_TMDB, meta: { title: 'Fight Club', year: 1999, type: 'movie' }, duration: 9000, watched: 6000 },
  });
  assert('Re-PUT updates watched',      Number(rePut.json?.watched) === 6000);
  assert('ID is stable across updates', rePut.json?.id === putMovie.json?.id);

  const getAfterUpdate = await api(`/users/${userId}/progress`, { headers: auth });
  const movieItems = Array.isArray(getAfterUpdate.json)
    ? getAfterUpdate.json.filter(p => p.tmdbId === TEST_MOVIE_TMDB) : [];
  assert('Re-PUT did not create a duplicate', movieItems.length === 1);

  const delRes = await api(`/users/${userId}/progress/${TEST_MOVIE_TMDB}`, {
    method: 'DELETE', headers: auth, body: { meta: { type: 'movie' } },
  });
  assert('DELETE progress returns 200', delRes.status === 200);
  assert('Deleted count ≥ 1',           Number(delRes.json?.count) >= 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. WATCH HISTORY
// ══════════════════════════════════════════════════════════════════════════════

await section('Watch history (new feature)', async () => {
  const emptyGet = await api(`/users/${userId}/watch-history`, { headers: auth });
  assert('GET /users/:id/watch-history returns 200', emptyGet.status === 200);
  assert('Watch history is initially empty',
    Array.isArray(emptyGet.json) && emptyGet.json.length === 0);

  const now = new Date().toISOString();

  const putMovie = await api(`/users/${userId}/watch-history/${TEST_MOVIE_TMDB}`, {
    method: 'PUT', headers: auth,
    body: { tmdbId: TEST_MOVIE_TMDB, meta: { title: 'Fight Club', year: 1999, type: 'movie' }, duration: 9000, watched: 9000, watchedAt: now, completed: true },
  });
  assert('PUT watch history movie returns 200', putMovie.status === 200,
    `got ${putMovie.status}: ${JSON.stringify(putMovie.json)}`);
  assert('Watch history entry has tmdbId',   putMovie.json?.tmdbId === TEST_MOVIE_TMDB);
  assert('Watch history entry is completed', putMovie.json?.completed === true);
  assert('Watch history entry has id',       typeof putMovie.json?.id === 'string');

  const putShow = await api(`/users/${userId}/watch-history/${TEST_SHOW_TMDB}`, {
    method: 'PUT', headers: auth,
    body: { tmdbId: TEST_SHOW_TMDB, meta: { title: 'GoT', year: 2011, type: 'show' }, duration: 3600, watched: 3600, watchedAt: now, completed: true, seasonId: TEST_SEASON_ID, episodeId: TEST_EPISODE_ID, seasonNumber: 1, episodeNumber: 1 },
  });
  assert('PUT show watch history returns 200', putShow.status === 200);
  assert('Show entry has episodeNumber',       putShow.json?.episodeNumber === 1);

  const getAfterPut = await api(`/users/${userId}/watch-history`, { headers: auth });
  assert('GET watch-history has ≥2 entries',
    Array.isArray(getAfterPut.json) && getAfterPut.json.length >= 2);
  const listItem = getAfterPut.json?.[0];
  assert('List items have watchedAt field', typeof listItem?.watchedAt === 'string');
  assert('List items have meta.title',      typeof listItem?.meta?.title === 'string');
  assert('List items have completed flag',  typeof listItem?.completed === 'boolean');

  // Re-PUT idempotency
  const rePut = await api(`/users/${userId}/watch-history/${TEST_MOVIE_TMDB}`, {
    method: 'PUT', headers: auth,
    body: { tmdbId: TEST_MOVIE_TMDB, meta: { title: 'Fight Club', year: 1999, type: 'movie' }, duration: 9000, watched: 9000, watchedAt: now, completed: true },
  });
  assert('Re-PUT watch history returns 200', rePut.status === 200);

  const getAfterRePut = await api(`/users/${userId}/watch-history`, { headers: auth });
  const movieCount = Array.isArray(getAfterRePut.json)
    ? getAfterRePut.json.filter(h => h.tmdbId === TEST_MOVIE_TMDB).length : 0;
  assert('Re-PUT did not create a duplicate', movieCount === 1);

  const delRes = await api(`/users/${userId}/watch-history/${TEST_MOVIE_TMDB}`, {
    method: 'DELETE', headers: auth, body: {},
  });
  assert('DELETE watch history returns 200', delRes.status === 200);
  assert('Deleted count ≥ 1',               Number(delRes.json?.count) >= 1);

  const getAfterDel = await api(`/users/${userId}/watch-history`, { headers: auth });
  assert('Movie history gone after delete',
    Array.isArray(getAfterDel.json) && !getAfterDel.json.find(h => h.tmdbId === TEST_MOVIE_TMDB));
  assert('Show history still present',
    Array.isArray(getAfterDel.json) && !!getAfterDel.json.find(h => h.tmdbId === TEST_SHOW_TMDB));
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. GROUP ORDER
// ══════════════════════════════════════════════════════════════════════════════

await section('Group order', async () => {
  const getEmpty = await api(`/users/${userId}/group-order`, { headers: auth });
  assert('GET /users/:id/group-order returns 200', getEmpty.status === 200);
  assert('Initial group order is an array', Array.isArray(getEmpty.json?.groupOrder));

  const putRes = await api(`/users/${userId}/group-order`, {
    method: 'PUT', headers: auth,
    body: ['favorites', 'watching', 'completed'],
  });
  assert('PUT /users/:id/group-order returns 200', putRes.status === 200,
    `got ${putRes.status}: ${JSON.stringify(putRes.json)}`);
  assert('Group order has 3 entries',  putRes.json?.groupOrder?.length === 3);
  assert('First group is "favorites"', putRes.json?.groupOrder?.[0] === 'favorites');

  const getAfterPut = await api(`/users/${userId}/group-order`, { headers: auth });
  assert('GET after PUT reflects saved order', getAfterPut.json?.groupOrder?.[1] === 'watching');
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. AUTH GUARDS
// ══════════════════════════════════════════════════════════════════════════════

await section('Auth guards', async () => {
  const bad  = { Authorization: '******' };
  const none = {};

  const meNone = await api('/users/@me', { headers: none });
  assert('GET /users/@me no token → 401',    meNone.status === 401);

  const meBad  = await api('/users/@me', { headers: bad });
  assert('GET /users/@me bogus token → 401', meBad.status === 401);

  const settBad = await api(`/users/${userId}/settings`, { headers: bad });
  assert('GET settings bogus token → 401',   settBad.status === 401);

  const histBad = await api(`/users/${userId}/watch-history`, { headers: bad });
  assert('GET watch-history bogus token → 401', histBad.status === 401);

  const progBad = await api(`/users/${userId}/progress`, { headers: bad });
  assert('GET progress bogus token → 401',   progBad.status === 401);

  const bmBad = await api(`/users/${userId}/bookmarks`, { headers: bad });
  assert('GET bookmarks bogus token → 401',  bmBad.status === 401);
});

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

const total = passed + failed;
console.log('\n' + '═'.repeat(52));
console.log(`Results: ${passed}/${total} tests passed`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  • ${f}`));
}
console.log('═'.repeat(52) + '\n');
process.exit(failed > 0 ? 1 : 0);
