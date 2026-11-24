/**
 * Finds Foundry Planner players who have left their state, using the same Century Games
 * web API the gift-code redeemer uses (see redeem.mjs). Run by .github/workflows/player-states.yml.
 *
 *   node check-states.mjs --ids 123,456     # just look these IDs up and print name + state
 *   node check-states.mjs                   # check every player, report who left (no writes)
 *   node check-states.mjs --clean           # same, then delete the players who left
 *
 * The lookup (POST /api/player, signed like /api/gift_code) returns the player's current
 * nickname and state (`kid`), but not their alliance. A player's planner state is the prefix
 * of their `allianceId` (e.g. `3038-hoc` -> 3038). Only a successful lookup with a different
 * state counts as "left": errors, unknown IDs and rate limits are reported, never deleted.
 */
import { createHash } from 'node:crypto';

const PLAYER_URL = 'https://wos-giftcode-api.centurygame.com/api/player';
const ORIGIN = 'https://wos-giftcode.centurygame.com';
const ENCRYPT_KEY = 'tB87#kPtkxqOS2'; // ships in Century Games' public web client
const DELAY_MS = 1200;
const TOO_FREQUENT_WAIT_MS = 60_000;

const args = process.argv.slice(2);
const idsArg = args.includes('--ids') ? args[args.indexOf('--ids') + 1] ?? '' : '';
const ids = `${idsArg},${process.env.PLAYER_IDS ?? ''}`.split(/[\s,]+/).filter(Boolean);
const clean = args.includes('--clean') || process.env.CLEAN === 'true';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function sign(data) {
  const s = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('&');
  return { sign: createHash('md5').update(s + ENCRYPT_KEY).digest('hex'), ...data };
}

/** -> { ok: true, name, state } | { ok: false, error } */
async function lookup(fid) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const body = new URLSearchParams(sign({ fid, time: String(Date.now()) }));
      const res = await fetch(PLAYER_URL, {
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
      const json = await res.json();
      if (json.code === 0 && json.data?.kid != null) {
        return { ok: true, name: json.data.nickname, state: String(json.data.kid) };
      }
      const error = `${json.msg ?? 'unknown'} (${json.err_code ?? json.code})`;
      if (/too frequent/i.test(error)) { await sleep(TOO_FREQUENT_WAIT_MS); continue; }
      return { ok: false, error };
    } catch (e) {
      log(`  request failed for ${fid}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
  return { ok: false, error: 'no answer after retries' };
}

if (ids.length) {
  for (const fid of ids) {
    const r = await lookup(fid);
    log(fid, r.ok ? `${r.name} | state ${r.state}` : `ERROR ${r.error}`);
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
  const r = await lookup(p.fid);
  const plannerState = p.allianceId.split('-')[0];
  if (!r.ok) failed.push(`${p.fid} ${p.name} [${p.allianceId}]: ${r.error}`);
  else if (r.state !== plannerState) left.push({ ...p, now: r });
  await sleep(DELAY_MS);
}

log(`LEFT THEIR STATE: ${left.length}`);
for (const p of left) log(`  ${p.fid} ${p.name} [${p.allianceId}] -> now "${p.now.name}" in state ${p.now.state}`);
log(`LOOKUP FAILED (left alone): ${failed.length}`);
for (const f of failed) log(`  ${f}`);

if (clean && left.length) {
  for (const p of left) await db.collection('players').doc(p.fid).delete();
  log(`deleted ${left.length} player(s)`);
} else if (left.length) {
  log('report only, nothing deleted (run with clean to delete)');
}
