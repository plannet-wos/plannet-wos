/**
 * Finds Foundry Planner players who have left their state, using the same Century Games
 * gift-code API the redeemer uses (see redeem.mjs). Run by .github/workflows/player-states.yml.
 *
 *   node check-states.mjs --ids 123,456 [--state 3038]  # just probe these IDs and print the answer
 *   node check-states.mjs                               # check every player, report who left (no writes)
 *   node check-states.mjs --clean                       # same, then delete the players who left
 *
 * Century removed its player lookup (/api/player) in 2026, so this probes /api/gift_code with a
 * code that doesn't exist and the player's planner state (`kid`, the prefix of `allianceId`).
 * Nothing can be redeemed with a made-up code. The answer tells the cases apart:
 *  - CDK NOT FOUND   -> the player passed the state check, so they're still in that state
 *  - USER INFO ERROR -> the player exists but not in that state: they left
 *  - ROLE NOT EXIST  -> the ID doesn't exist at all
 * Anything else (rate limits, transport errors) is reported and never deleted.
 */
import { createHash } from 'node:crypto';

const REDEEM_URL = 'https://wos-giftcode-api.centurygame.com/api/gift_code';
const ORIGIN = 'https://wos-giftcode.centurygame.com';
const ENCRYPT_KEY = 'tB87#kPtkxqOS2'; // ships in Century Games' public web client
const PROBE_CODE = 'PLANNETSTATECHECK'; // deliberately not a real code
const DELAY_MS = 1200;
const TOO_FREQUENT_WAIT_MS = 60_000;

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] ?? '' : '');
const ids = `${arg('--ids')},${process.env.PLAYER_IDS ?? ''}`.split(/[\s,]+/).filter(Boolean);
const idsState = arg('--state') || process.env.STATE || '3038';
const clean = args.includes('--clean') || process.env.CLEAN === 'true';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function sign(data) {
  const s = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('&');
  return { sign: createHash('md5').update(s + ENCRYPT_KEY).digest('hex'), ...data };
}

/** -> 'in_state' | 'left' | 'no_such_player' | 'error: ...' */
async function probe(fid, kid) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const body = new URLSearchParams(sign({ cdk: PROBE_CODE, fid, kid: String(kid), time: String(Math.floor(Date.now() / 1000)) }));
      const res = await fetch(REDEEM_URL, {
        method: 'POST',
        body,
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/x-www-form-urlencoded',
          origin: ORIGIN,
          referer: ORIGIN + '/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429) { await sleep(TOO_FREQUENT_WAIT_MS); continue; }
      if (!res.ok) { log(`  HTTP ${res.status} for ${fid}`); await sleep(2000 * attempt); continue; }
      const { msg = '', err_code } = await res.json();
      const m = String(msg).replace(/\.$/, '');
      if (m === 'TOO FREQUENT') { await sleep(TOO_FREQUENT_WAIT_MS); continue; }
      if (m === 'TIMEOUT RETRY') { await sleep(3000); continue; }
      if (m === 'CDK NOT FOUND') return 'in_state';
      if (m === 'USER INFO ERROR') return 'left';
      if (err_code === 40001 && /not exist/i.test(m)) return 'no_such_player';
      return `error: ${m} (${err_code})`;
    } catch (e) {
      log(`  request failed for ${fid}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
  return 'error: no answer after retries';
}

if (ids.length) {
  for (const fid of ids) {
    log(fid, `state ${idsState}:`, await probe(fid, idsState));
    await sleep(DELAY_MS);
  }
  process.exit(0);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'tal-coordinator' });
const db = getFirestore();

const snap = await db.collection('players').get();
const players = snap.docs
  .map((d) => ({ fid: d.id, name: d.get('inGameName'), allianceId: String(d.get('allianceId') ?? '') }))
  .filter((p) => /^\d{6,12}$/.test(p.fid) && /^\d{1,6}-/.test(p.allianceId))
  .sort((a, b) => a.allianceId.localeCompare(b.allianceId) || a.fid.localeCompare(b.fid));
log(`checking ${players.length} player(s) (of ${snap.size})`);

const left = [];
const failed = [];
for (const p of players) {
  const r = await probe(p.fid, p.allianceId.split('-')[0]);
  if (r === 'left') left.push(p);
  else if (r !== 'in_state') failed.push(`${p.fid} ${p.name} [${p.allianceId}]: ${r}`);
  await sleep(DELAY_MS);
}

log(`LEFT THEIR STATE: ${left.length}`);
for (const p of left) log(`  ${p.fid} ${p.name} [${p.allianceId}]`);
log(`NOT CONFIRMED (left alone): ${failed.length}`);
for (const f of failed) log(`  ${f}`);

if (clean && left.length) {
  for (const p of left) await db.collection('players').doc(p.fid).delete();
  log(`deleted ${left.length} player(s)`);
} else if (left.length) {
  log('report only, nothing deleted (run with clean to delete)');
}
