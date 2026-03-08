/**
 * Integration test suite for the p-stream backend.
 *
 * Exercises every major API surface so CI can give a confident answer to
 * "does this PR actually work?".
 *
 * Usage:
 *   node tests/integration.mjs [BASE_URL]
 *
 * BASE_URL defaults to http://localhost:3000
 *
 * Exit code 0 = all tests passed
 * Exit code 1 = one or more tests failed
 */

import nacl from 'tweetnacl';

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

// ─── key pair: random each run so registrations never collide ─────────────────
// Using nacl.sign.keyPair() produces a fresh Ed25519 key every time.
const keyPair = nacl.sign.keyPair();
const publicKeyB64 = toBase64Url(keyPair.publicKey);

// ─── test data ────────────────────────────────────────────────────────────────

const TEST_NAMESPACE    = 'integration-test';
const TEST_MOVIE_TMDB   = 'movie-550';   // Fight Club
const TEST_SHOW_TMDB    = 'tv-1399';     // Game of Thrones
const TEST_SEASON_ID    = 'season-1';
const TEST_EPISODE_ID   = 'episode-1';

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
  // Start – get challenge
  const startRes = await api('/auth/register/start', { method: 'POST', body: {} });
  assert('POST /auth/register/start returns 200', startRes.status === 200);
  const challengeCode = startRes.json?.challenge;
  assert('Registration challenge is a non-empty string',
    typeof challengeCode === 'string' && challengeCode.length > 0);
  if (!challengeCode) return; // can't proceed

  // Sign challenge
  const sig    = nacl.sign.detached(Buffer.from(challengeCode), keyPair.secretKey);
  const sigB64 = toBase64Url(sig);

  // Complete – register the account
  const completeRes = await api('/auth/register/complete', {
    method: 'POST',
    headers: { 'User-Agent': 'integration-test/1.0' },
    body: {
      publicKey: publicKeyB64,
      challenge: { code: challengeCode, signature: sigB64 },
      namespace: TEST_NAMESPACE,
      device: 'CI-Integration-Test',
      profile: { colorA: '#FF0000', colorB: '#00FF00', icon: 'user' },
    },
  });
  assert('POST /auth/register/complete returns 200',
    completeRes.status === 200,
    `got ${completeRes.status}: ${JSON.stringify(completeRes.json)}`);
  assert('Registration returns user object',  !!completeRes.json?.user?.id);
  assert('Registration returns JWT token',    typeof completeRes.json?.token === 'string');
  assert('Registration returns session',      !!completeRes.json?.session?.id);
  assert('User has a non-empty nickname',
    typeof completeRes.json?.user?.nickname === 'string' &&
    completeRes.json.user.nickname.length > 0);
  assert('User has correct namespace',        completeRes.json?.user?.namespace === TEST_NAMESPACE);

  authToken = completeRes.json?.token  ?? null;
  userId    = completeRes.json?.user?.id ?? null;

  // Duplicate registration with same key must be rejected
  const start2 = await api('/auth/register/start', { method: 'POST', body: {} });
  const sig2    = nacl.sign.detached(Buffer.from(start2.json.challenge), keyPair.secretKey);
  const dupRes  = await api('/auth/register/complete', {
    method: 'POST',
    headers: { 'User-Agent': 'integration-test/1.0' },
    body: {
      publicKey: publicKeyB64,
      challenge: { code: start2.json.challenge, signature: toBase64Url(sig2) },
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

  const loginSig = nacl.sign.detached(Buffer.from(loginChallenge), keyPair.secretKey);
  const loginComplete = await api('/auth/login/complete', {
    method: 'POST',
    headers: { 'User-Agent': 'integration-test/1.0' },
    body: {
      publicKey: publicKeyB64,
      challenge: { code: loginChallenge, signature: toBase64Url(loginSig) },
      device: 'CI-Login-Test',
    },
  });
  assert('POST /auth/login/complete returns 200',
    loginComplete.status === 200,
    `got ${loginComplete.status}: ${JSON.stringify(loginComplete.json)}`);
  assert('Login returns user',          !!loginComplete.json?.user?.id);
  assert('Login returns JWT token',     typeof loginComplete.json?.token === 'string');
  assert('Login user ID matches registered user', loginComplete.json?.user?.id === userId);
});

const auth = { Authorization: `Bearer ${authToken}` };

// ══════════════════════════════════════════════════════════════════════════════
// 4. USER PROFILE  (/users/@me  and  PATCH /users/:id)
// ══════════════════════════════════════════════════════════════════════════════

await section('User profile', async () => {
  const meRes = await api('/users/@me', { headers: auth });
  assert('GET /users/@me returns 200',       meRes.status === 200);
  assert('GET /users/@me has user object',   !!meRes.json?.user?.id);
  assert('GET /users/@me user ID correct',   meRes.json?.user?.id === userId);
  assert('GET /users/@me has session',       !!meRes.json?.session?.id);
  assert('GET /users/@me user has nickname', typeof meRes.json?.user?.nickname === 'string');
  assert('GET /users/@me has publicKey',     typeof meRes.json?.user?.publicKey === 'string');

  // PATCH nickname
  const patchNick = await api(`/users/${userId}`, {
    method: 'PATCH',
    headers: { ...auth, 'User-Agent': 'integration-test/1.0' },
    body: { nickname: 'IntegrationTester' },
  });
  assert('PATCH /users/:id returns 200',      patchNick.status === 200,
    `got ${patchNick.status}: ${JSON.stringify(patchNick.json)}`);
  assert('Nickname is updated',               patchNick.json?.nickname === 'IntegrationTester');

  // PATCH profile colours
  const patchProfile = await api(`/users/${userId}`, {
    method: 'PATCH',
    headers: { ...auth, 'User-Agent': 'integration-test/1.0' },
    body: { profile: { colorA: '#AABBCC', colorB: '#DDEEFF', icon: 'star' } },
  });
  assert('PATCH profile returns 200',         patchProfile.status === 200);
  assert('Profile colorA updated',            patchProfile.json?.profile?.colorA === '#AABBCC');
  assert('Profile icon updated',              patchProfile.json?.profile?.icon === 'star');

  // Unauthenticated access rejected
  const unauth = await api('/users/@me');
  assert('GET /users/@me without token → 401', unauth.status === 401);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. SETTINGS  (new p-stream fields: customTheme, tidbKey, enablePauseOverlay)
// ══════════════════════════════════════════════════════════════════════════════

await section('User settings', async () => {
  const getRes = await api(`/users/${userId}/settings`, { headers: auth });
  assert('GET /users/:id/settings returns 200', getRes.status === 200);
  assert('Settings has enableAutoplay field', 'enableAutoplay' in (getRes.json ?? {}));

  // PUT standard settings
  const putStd = await api(`/users/${userId}/settings`, {
    method: 'PUT',
    headers: auth,
    body: {
      applicationTheme: 'dark',
      applicationLanguage: 'en',
      enableThumbnails: true,
      enableAutoplay: false,
      enableSkipCredits: true,
    },
  });
  assert('PUT /users/:id/settings returns 200',  putStd.status === 200,
    `got ${putStd.status}: ${JSON.stringify(putStd.json)}`);
  assert('applicationTheme persisted',         putStd.json?.applicationTheme === 'dark');
  assert('enableAutoplay persisted as false',  putStd.json?.enableAutoplay === false);
  assert('enableThumbnails persisted as true', putStd.json?.enableThumbnails === true);

  // PUT new p-stream-specific fields
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
  assert('customTheme.secondary persisted',      putNew.json?.customTheme?.secondary === '#222222');
  assert('tidbKey persisted',                    putNew.json?.tidbKey === 'my-tidb-key');
  assert('enablePauseOverlay persisted as true', putNew.json?.enablePauseOverlay === true);
  assert('debridToken persisted',                putNew.json?.debridToken === 'my-debrid-token');
  assert('debridService persisted',              putNew.json?.debridService === 'real-debrid');

  // Round-trip: GET must reflect the saved values
  const getAgain = await api(`/users/${userId}/settings`, { headers: auth });
  assert('GET after PUT reflects enablePauseOverlay', getAgain.json?.enablePauseOverlay === true);
  assert('GET after PUT reflects customTheme',        getAgain.json?.customTheme?.secondary === '#222222');
  assert('GET after PUT reflects tidbKey',            getAgain.json?.tidbKey === 'my-tidb-key');
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. BOOKMARKS  (GET bulk, PUT bulk, POST+DELETE single)
// ══════════════════════════════════════════════════════════════════════════════

await section('Bookmarks', async () => {
  const emptyGet = await api(`/users/${userId}/bookmarks`, { headers: auth });
  assert('GET /users/:id/bookmarks returns 200',   emptyGet.status === 200);
  assert('Bookmarks are initially empty',
    Array.isArray(emptyGet.json) && emptyGet.json.length === 0,
    `got: ${JSON.stringify(emptyGet.json)}`);

  // Bulk PUT (full replace)
  const bulkPut = await api(`/users/${userId}/bookmarks`, {
    method: 'PUT',
    headers: auth,
    body: [
      {
        tmdbId: TEST_MOVIE_TMDB,
        meta: { title: 'Fight Club', year: 1999, type: 'movie', poster: '/poster.jpg' },
        group: ['favorites'],
        favoriteEpisodes: [],
      },
      {
        tmdbId: TEST_SHOW_TMDB,
        meta: { title: 'Game of Thrones', year: 2011, type: 'show', poster: '/got.jpg' },
        group: ['watching'],
        favoriteEpisodes: ['s01e01'],
      },
    ],
  });
  assert('PUT /users/:id/bookmarks returns 200',
    bulkPut.status === 200, `got ${bulkPut.status}: ${JSON.stringify(bulkPut.json)}`);
  assert('Bulk PUT returns array of 2 items',
    Array.isArray(bulkPut.json) && bulkPut.json.length === 2);

  // GET after bulk PUT
  const getAfterPut = await api(`/users/${userId}/bookmarks`, { headers: auth });
  assert('GET after bulk PUT returns 2 bookmarks',
    Array.isArray(getAfterPut.json) && getAfterPut.json.length === 2);
  const movieBm = Array.isArray(getAfterPut.json)
    ? getAfterPut.json.find(b => b.tmdbId === TEST_MOVIE_TMDB) : null;
  assert('Movie bookmark has tmdbId',    movieBm?.tmdbId === TEST_MOVIE_TMDB);
  assert('Movie bookmark has meta',      !!movieBm?.meta?.title);
  assert('Movie bookmark has group',     Array.isArray(movieBm?.group) && movieBm.group.includes('favorites'));
  const showBm = Array.isArray(getAfterPut.json)
    ? getAfterPut.json.find(b => b.tmdbId === TEST_SHOW_TMDB) : null;
  assert('Show bookmark has favoriteEpisodes', Array.isArray(showBm?.favoriteEpisodes));

  // Single-item POST (upsert)
  const singlePost = await api(`/users/${userId}/bookmarks/${TEST_MOVIE_TMDB}`, {
    method: 'POST',
    headers: auth,
    body: {
      meta: { title: 'Fight Club', year: 1999, type: 'movie' },
      group: ['favorites', 'classics'],
      favoriteEpisodes: [],
    },
  });
  assert('POST /users/:id/bookmarks/:tmdbid returns 200',
    singlePost.status === 200, `got ${singlePost.status}: ${JSON.stringify(singlePost.json)}`);
  assert('Upserted bookmark has 2 groups',
    Array.isArray(singlePost.json?.group) && singlePost.json.group.length === 2);

  // DELETE single
  const delRes = await api(`/users/${userId}/bookmarks/${TEST_MOVIE_TMDB}`, {
    method: 'DELETE',
    headers: auth,
  });
  assert('DELETE /users/:id/bookmarks/:tmdbid returns 200', delRes.status === 200);

  // Confirm deletion
  const getAfterDel = await api(`/users/${userId}/bookmarks`, { headers: auth });
  const deletedGone = Array.isArray(getAfterDel.json)
    ? !getAfterDel.json.find(b => b.tmdbId === TEST_MOVIE_TMDB)
    : false;
  assert('Deleted movie bookmark is gone', deletedGone);
  const showStillExists = Array.isArray(getAfterDel.json)
    ? !!getAfterDel.json.find(b => b.tmdbId === TEST_SHOW_TMDB)
    : false;
  assert('Show bookmark still present after partial delete', showStillExists);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. PROGRESS
// ══════════════════════════════════════════════════════════════════════════════

await section('Progress tracking', async () => {
  const emptyGet = await api(`/users/${userId}/progress`, { headers: auth });
  assert('GET /users/:id/progress returns 200', emptyGet.status === 200);
  assert('Progress is initially empty',
    Array.isArray(emptyGet.json) && emptyGet.json.length === 0,
    `got: ${JSON.stringify(emptyGet.json)}`);

  // PUT movie progress
  const putMovie = await api(`/users/${userId}/progress/${TEST_MOVIE_TMDB}`, {
    method: 'PUT',
    headers: auth,
    body: {
      tmdbId: TEST_MOVIE_TMDB,
      meta: { title: 'Fight Club', year: 1999, type: 'movie' },
      duration: 9000,
      watched: 4500,
    },
  });
  assert('PUT /users/:id/progress/:tmdbId returns 200',
    putMovie.status === 200, `got ${putMovie.status}: ${JSON.stringify(putMovie.json)}`);
  assert('Movie progress has tmdbId',   putMovie.json?.tmdbId === TEST_MOVIE_TMDB);
  assert('Movie progress has duration', Number(putMovie.json?.duration) === 9000);
  assert('Movie progress has watched',  Number(putMovie.json?.watched)  === 4500);
  assert('Movie progress has id',       typeof putMovie.json?.id === 'string');

  // PUT show episode progress
  const putShow = await api(`/users/${userId}/progress/${TEST_SHOW_TMDB}`, {
    method: 'PUT',
    headers: auth,
    body: {
      tmdbId: TEST_SHOW_TMDB,
      meta: { title: 'Game of Thrones', year: 2011, type: 'show' },
      duration: 3600,
      watched: 1800,
      seasonId: TEST_SEASON_ID,
      episodeId: TEST_EPISODE_ID,
      seasonNumber: 1,
      episodeNumber: 1,
    },
  });
  assert('PUT show episode progress returns 200', putShow.status === 200);
  assert('Show progress has seasonId',
    putShow.json?.seasonId === TEST_SEASON_ID,
    `got: ${JSON.stringify(putShow.json)}`);

  // GET – now has entries
  const getAfterPut = await api(`/users/${userId}/progress`, { headers: auth });
  assert('GET progress after PUT has ≥1 item',
    Array.isArray(getAfterPut.json) && getAfterPut.json.length >= 1);

  // UPDATE – re-PUT with higher watched value should update not create a duplicate
  const updateRes = await api(`/users/${userId}/progress/${TEST_MOVIE_TMDB}`, {
    method: 'PUT',
    headers: auth,
    body: {
      tmdbId: TEST_MOVIE_TMDB,
      meta: { title: 'Fight Club', year: 1999, type: 'movie' },
      duration: 9000,
      watched: 6000,
    },
  });
  assert('Re-PUT (update) progress returns 200', updateRes.status === 200);
  assert('Updated watched value is saved',        Number(updateRes.json?.watched) === 6000);
  assert('ID is stable across updates',           updateRes.json?.id === putMovie.json?.id);

  // GET again to verify count hasn't grown
  const getAfterUpdate = await api(`/users/${userId}/progress`, { headers: auth });
  const movieItems = Array.isArray(getAfterUpdate.json)
    ? getAfterUpdate.json.filter(p => p.tmdbId === TEST_MOVIE_TMDB)
    : [];
  assert('Re-PUT did not create a duplicate',     movieItems.length === 1);

  // DELETE
  const delRes = await api(`/users/${userId}/progress/${TEST_MOVIE_TMDB}`, {
    method: 'DELETE',
    headers: auth,
    body: { meta: { type: 'movie' } },
  });
  assert('DELETE /users/:id/progress/:tmdbId returns 200', delRes.status === 200);
  assert('Deleted progress count ≥ 1', Number(delRes.json?.count) >= 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. WATCH HISTORY  (new feature from the p-stream merge)
// ══════════════════════════════════════════════════════════════════════════════

await section('Watch history (new feature)', async () => {
  const emptyGet = await api(`/users/${userId}/watch-history`, { headers: auth });
  assert('GET /users/:id/watch-history returns 200', emptyGet.status === 200);
  assert('Watch history is initially empty',
    Array.isArray(emptyGet.json) && emptyGet.json.length === 0,
    `got: ${JSON.stringify(emptyGet.json)}`);

  const now = new Date().toISOString();

  // PUT movie watch entry
  const putMovie = await api(`/users/${userId}/watch-history/${TEST_MOVIE_TMDB}`, {
    method: 'PUT',
    headers: auth,
    body: {
      tmdbId: TEST_MOVIE_TMDB,
      meta: { title: 'Fight Club', year: 1999, type: 'movie' },
      duration: 9000,
      watched: 9000,
      watchedAt: now,
      completed: true,
    },
  });
  assert('PUT /users/:id/watch-history/:tmdbid returns 200',
    putMovie.status === 200, `got ${putMovie.status}: ${JSON.stringify(putMovie.json)}`);
  // Single-item response is at top level
  const movie = putMovie.json?.items?.[0] ?? putMovie.json;
  assert('Watch history entry has tmdbId',    movie?.tmdbId === TEST_MOVIE_TMDB);
  assert('Watch history entry is completed',  movie?.completed === true);
  assert('Watch history entry has watchedAt', typeof movie?.watchedAt === 'string');
  assert('Watch history entry has id',        typeof movie?.id === 'string');

  // PUT show episode
  const putShow = await api(`/users/${userId}/watch-history/${TEST_SHOW_TMDB}`, {
    method: 'PUT',
    headers: auth,
    body: {
      tmdbId: TEST_SHOW_TMDB,
      meta: { title: 'Game of Thrones', year: 2011, type: 'show' },
      duration: 3600,
      watched: 3600,
      watchedAt: now,
      completed: true,
      seasonId: TEST_SEASON_ID,
      episodeId: TEST_EPISODE_ID,
      seasonNumber: 1,
      episodeNumber: 1,
    },
  });
  assert('PUT show watch history returns 200', putShow.status === 200);
  const showEntry = putShow.json?.items?.[0] ?? putShow.json;
  assert('Show watch entry has episodeNumber', showEntry?.episodeNumber === 1);

  // GET list – contains both entries
  const getAfterPut = await api(`/users/${userId}/watch-history`, { headers: auth });
  assert('GET watch-history after PUT has ≥2 entries',
    Array.isArray(getAfterPut.json) && getAfterPut.json.length >= 2);
  const listItem = getAfterPut.json?.[0];
  assert('List items have watchedAt field', typeof listItem?.watchedAt === 'string');
  assert('List items have meta.title',      typeof listItem?.meta?.title === 'string');
  assert('List items have completed flag',  typeof listItem?.completed === 'boolean');
  assert('List items have duration field',  listItem?.duration !== undefined);

  // Idempotent re-PUT (update) – should not create a second row
  const rePut = await api(`/users/${userId}/watch-history/${TEST_MOVIE_TMDB}`, {
    method: 'PUT',
    headers: auth,
    body: {
      tmdbId: TEST_MOVIE_TMDB,
      meta: { title: 'Fight Club', year: 1999, type: 'movie' },
      duration: 9000,
      watched: 9000,
      watchedAt: now,
      completed: true,
    },
  });
  assert('Re-PUT watch history returns 200', rePut.status === 200);

  const getAfterRePut = await api(`/users/${userId}/watch-history`, { headers: auth });
  const movieCount = Array.isArray(getAfterRePut.json)
    ? getAfterRePut.json.filter(h => h.tmdbId === TEST_MOVIE_TMDB).length
    : 0;
  assert('Re-PUT did not create a duplicate row', movieCount === 1);

  // DELETE
  const delRes = await api(`/users/${userId}/watch-history/${TEST_MOVIE_TMDB}`, {
    method: 'DELETE',
    headers: auth,
    body: {},
  });
  assert('DELETE /users/:id/watch-history/:tmdbid returns 200', delRes.status === 200);
  assert('Deleted watch history count ≥ 1', Number(delRes.json?.count) >= 1);

  // Confirm deletion
  const getAfterDel = await api(`/users/${userId}/watch-history`, { headers: auth });
  const movieGone = Array.isArray(getAfterDel.json)
    ? !getAfterDel.json.find(h => h.tmdbId === TEST_MOVIE_TMDB)
    : false;
  assert('Deleted movie no longer in watch history', movieGone);
  const showRemains = Array.isArray(getAfterDel.json)
    ? !!getAfterDel.json.find(h => h.tmdbId === TEST_SHOW_TMDB)
    : false;
  assert('Show entry still present after partial delete', showRemains);
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. GROUP ORDER
// ══════════════════════════════════════════════════════════════════════════════

await section('Group order', async () => {
  const getEmpty = await api(`/users/${userId}/group-order`, { headers: auth });
  assert('GET /users/:id/group-order returns 200', getEmpty.status === 200);
  assert('Initial group order is an array',
    Array.isArray(getEmpty.json?.groupOrder),
    `got: ${JSON.stringify(getEmpty.json)}`);

  const putRes = await api(`/users/${userId}/group-order`, {
    method: 'PUT',
    headers: auth,
    body: ['favorites', 'watching', 'completed'],
  });
  assert('PUT /users/:id/group-order returns 200',
    putRes.status === 200, `got ${putRes.status}: ${JSON.stringify(putRes.json)}`);
  assert('Group order has 3 entries',    putRes.json?.groupOrder?.length === 3);
  assert('First group is "favorites"',   putRes.json?.groupOrder?.[0] === 'favorites');
  assert('Last group is "completed"',    putRes.json?.groupOrder?.[2] === 'completed');

  const getAfterPut = await api(`/users/${userId}/group-order`, { headers: auth });
  assert('GET after PUT reflects saved order',
    getAfterPut.json?.groupOrder?.[1] === 'watching');
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. AUTH GUARDS (no token / bad token must be rejected)
// ══════════════════════════════════════════════════════════════════════════════

await section('Auth guards', async () => {
  const bad = { Authorization: 'Bearer not-a-real-token' };
  const noAuth = {};

  const meNoAuth  = await api('/users/@me', { headers: noAuth });
  assert('GET /users/@me with no token → 401', meNoAuth.status === 401);

  const meBad     = await api('/users/@me', { headers: bad });
  assert('GET /users/@me with bogus token → 401', meBad.status === 401);

  const settBad   = await api(`/users/${userId}/settings`, { headers: bad });
  assert('GET settings with bogus token → 401', settBad.status === 401);

  const histBad   = await api(`/users/${userId}/watch-history`, { headers: bad });
  assert('GET watch-history with bogus token → 401', histBad.status === 401);

  const progBad   = await api(`/users/${userId}/progress`, { headers: bad });
  assert('GET progress with bogus token → 401', progBad.status === 401);

  const bmBad     = await api(`/users/${userId}/bookmarks`, { headers: bad });
  assert('GET bookmarks with bogus token → 401', bmBad.status === 401);
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
