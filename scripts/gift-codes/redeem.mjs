/**
 * Auto-redeems Whiteout Survival gift codes for every player in the Foundry Planner's
 * `players` collection. Run by .github/workflows/gift-codes.yml.
 *
 *   node redeem.mjs [--dry-run] [--codes CODE1,CODE2]
 *
 * Each run:
 *  1. Collects candidate codes: --codes / GIFT_CODES (typed in by an admin) plus a loose scrape
 *     of public code-list pages (SOURCES). The scrape is deliberately permissive; step 3 is
 *     the real filter.
 *  2. Drops anything already known in `gift_codes/{code}` as dead (invalid/expired/used up).
 *  3. Tries each new candidate on ONE player first. CDK NOT FOUND / TIME ERROR / USED marks the
 *     code dead after one request instead of one per player.
 *  4. Redeems live codes for every player not yet recorded in that code's `results` map.
 *
 * State lives in `gift_codes/{code}` (locked by the default-deny rule; only this script's
 * service account touches it): { status, source, firstSeenAt, checkedAt, results: {fid: status} }.
 *
 * Endpoint: wos-giftcode-api.centurygame.com/api/gift_code — the game's own web redeem page.
 * Since 2026-07 it's a single signed POST per player (fid, cdk, kid = state, time in seconds),
 * no captcha; see github.com/justncodes/wos-giftcode for the reference implementation this
 * mirrors. It's undocumented and can change at any time. Its only limit is per player
 * (40019 TOO FREQUENT), so players are processed sequentially with a small delay.
 *
 * --dry-run sends nothing to Century Games and writes nothing to Firestore: it reads players,
 * scrapes the sources and prints what a live run would try.
 */
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const REDEEM_URL = 'https://wos-giftcode-api.centurygame.com/api/gift_code';
const ORIGIN = 'https://wos-giftcode.centurygame.com';
const ENCRYPT_KEY = 'tB87#kPtkxqOS2'; // ships in Century Games' public web client

// Only pages that serve plain HTTP clients. wostools.net, whiteoutsurvival-community.com and
// destructoid.com answer 403 to automated requests, so they're left out on purpose rather than
// worked around. Anything missed here can be added by hand via the workflow's `codes` input.
const SOURCES = [
  'https://www.pocketgamer.com/whiteout-survival/codes/',
];

const DELAY_MS = 1200;            // between players
const TOO_FREQUENT_WAIT_MS = 60_000;
const MAX_ATTEMPTS = 3;           // per player per code
const MAX_NEW_CANDIDATES = 15;    // validation requests per run, so a noisy scrape stays cheap
const FLUSH_EVERY = 25;           // write results to Firestore every N players

/** Statuses that mean the code is dead for everyone. */
const DEAD = { 'CDK NOT FOUND': 'invalid', 'TIME ERROR': 'expired', 'USED': 'limit_reached' };
/** Statuses that are final for one player (no point retrying them on a later run). */
const FINAL_FOR_PLAYER = new Set([
  'SUCCESS', 'RECEIVED', 'SAME TYPE EXCHANGE', 'USER INFO ERROR', 'ROLE NOT EXIST',
  'STOVE_LV ERROR', 'RECHARGE_MONEY ERROR', 'RECHARGE_MONEY_VIP ERROR',
]);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
const codesArg = args.includes('--codes') ? args[args.indexOf('--codes') + 1] ?? '' : '';
const manualCodes = `${codesArg},${process.env.GIFT_CODES ?? ''}`.split(/[\s,]+/).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- Century Games API ----------

function sign(data) {
  const s = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('&');
  return { sign: createHash('md5').update(s + ENCRYPT_KEY).digest('hex'), ...data };
}

function classify({ msg = '', err_code } = {}) {
  msg = String(msg).replace(/\.$/, '');
  if (err_code === 40001 && /not exist/i.test(msg)) return 'ROLE NOT EXIST';
  if (/sign error/i.test(msg)) return 'SIGN ERROR';
  return msg || `ERR ${err_code}`;
}

async function redeemOnce(fid, kid, cdk) {
  const body = new URLSearchParams(sign({ cdk, fid, kid: String(kid), time: String(Math.floor(Date.now() / 1000)) }));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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
      if (res.ok) return classify(await res.json());
      log(`  HTTP ${res.status} for ${fid}`);
    } catch (e) {
      log(`  request failed for ${fid}: ${e.message}`);
    }
    await sleep(2000 * attempt);
  }
  return 'TRANSPORT ERROR';
}

/** One player, with retries for TOO FREQUENT / TIMEOUT RETRY. */
async function redeem(fid, kid, cdk) {
  let status;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    status = await redeemOnce(fid, kid, cdk);
    if (status === 'TOO FREQUENT') { await sleep(TOO_FREQUENT_WAIT_MS); continue; }
    if (status === 'TIMEOUT RETRY') { await sleep(3000); continue; }
    break;
  }
  return status;
}

// ---------- code discovery ----------

const STOPWORDS = new Set(['ACTIVE', 'EXPIRED', 'CODES', 'REDEEM', 'REWARDS', 'UPDATED', 'WHITEOUT', 'SURVIVAL', 'CENTURY', 'GAMES', 'IMPORTANT', 'NOTE']);

/** Loose: any short alphanumeric token inside <strong>/<b>/<code>/<li>/<td> that looks code-ish. */
function extractCandidates(html) {
  const out = new Set();
  const re = /<(strong|b|code|li|td|span)[^>]*>\s*([A-Za-z0-9]{4,20})\s*(?:<\/\1>|[\s\-–—:(])/g;
  for (const m of html.matchAll(re)) {
    const t = m[2];
    if (STOPWORDS.has(t.toUpperCase())) continue;
    const codeish = /\d/.test(t) || /[a-z][A-Z]|[A-Z]{2,}[a-z]|[A-Z][a-z]+[A-Z]/.test(t) || (/^[A-Z]+$/.test(t) && t.length >= 6);
    if (codeish && !/^\d+$/.test(t)) out.add(t);
  }
  return out;
}

async function scrape() {
  const found = new Map(); // code -> source
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { log(`source ${url}: HTTP ${res.status}`); continue; }
      const codes = extractCandidates(await res.text());
      log(`source ${url}: ${codes.size} candidate(s) ${[...codes].join(' ')}`);
      for (const c of codes) if (!found.has(c)) found.set(c, url);
    } catch (e) {
      log(`source ${url}: ${e.message}`);
    }
  }
  return found;
}

// ---------- main ----------

initializeApp({ credential: applicationDefault(), projectId: 'tal-coordinator' });
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Which service account this is matters for IAM (it needs Cloud Datastore User); the email isn't secret.
  const { readFileSync } = await import('node:fs');
  log(`service account: ${JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).client_email}`);
}
const db = getFirestore();

const playersSnap = await db.collection('players').get();
const players = playersSnap.docs
  .map((d) => ({ fid: d.id, kid: String(d.get('allianceId') ?? '').split('-')[0], optOut: d.get('giftCodeOptOut') === true }))
  .filter((p) => /^\d{6,12}$/.test(p.fid) && /^\d{1,6}$/.test(p.kid) && !p.optOut)
  .sort((a, b) => a.fid.localeCompare(b.fid));
log(`${players.length} player(s) eligible (of ${playersSnap.size})`);
if (!players.length) process.exit(0);

const candidates = await scrape();
for (const c of manualCodes) candidates.set(c, 'manual');

const codesCol = db.collection('gift_codes');
const toRun = [];
let newChecked = 0;
for (const [code, source] of candidates) {
  const snap = await codesCol.doc(code).get();
  const status = snap.get('status');
  if (status && status !== 'active') continue; // known dead
  if (!snap.exists) {
    if (source !== 'manual' && newChecked >= MAX_NEW_CANDIDATES) continue;
    newChecked++;
  }
  toRun.push({ code, source, known: snap.exists, results: snap.get('results') ?? {} });
}
log(`codes to process: ${toRun.map((c) => `${c.code}${c.known ? '' : ' (new)'}`).join(', ') || 'none'}`);

if (dryRun) {
  for (const c of toRun) {
    const todo = players.filter((p) => !FINAL_FOR_PLAYER.has(c.results[p.fid])).length;
    log(`[dry run] ${c.code}: would ${c.known ? '' : 'validate on 1 player, then '}redeem for ${todo} player(s)`);
  }
  process.exit(0);
}

const summary = [];
for (const c of toRun) {
  const ref = codesCol.doc(c.code);
  const pending = players.filter((p) => !FINAL_FOR_PLAYER.has(c.results[p.fid]));
  if (!pending.length) { summary.push(`${c.code}: everyone done`); continue; }

  log(`== ${c.code}: ${pending.length} player(s) to go`);
  const counts = {};
  let buffer = {};
  const flush = async () => {
    await ref.set({ checkedAt: Date.now(), results: buffer }, { merge: true }); // merge is deep: adds to the map
    buffer = {};
  };

  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const status = await redeem(p.fid, p.kid, c.code);
    counts[status] = (counts[status] ?? 0) + 1;
    if (DEAD[status]) {
      log(`  ${c.code} is ${DEAD[status]} (${status}), stopping this code`);
      await ref.set({ code: c.code, status: DEAD[status], source: c.source, checkedAt: Date.now(), ...(c.known ? {} : { firstSeenAt: Date.now() }) }, { merge: true });
      break;
    }
    if (status === 'SIGN ERROR') {
      log('  SIGN ERROR: the API contract changed. Aborting the whole run so nobody gets spammed.');
      await flush();
      process.exit(1);
    }
    if (i === 0 && !c.known) {
      if (!FINAL_FOR_PLAYER.has(status)) {
        log(`  ${c.code} inconclusive on the test player (${status}), skipping it until the next run`);
        break;
      }
      log(`  ${c.code} validated (${status}), it's live`);
      await ref.set({ code: c.code, status: 'active', source: c.source, firstSeenAt: Date.now() }, { merge: true });
    }
    if (FINAL_FOR_PLAYER.has(status)) buffer[p.fid] = status;
    if (Object.keys(buffer).length >= FLUSH_EVERY) await flush();
    await sleep(DELAY_MS);
  }
  if (Object.keys(buffer).length) await flush();
  summary.push(`${c.code}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

log('SUMMARY\n' + (summary.join('\n') || 'nothing to do'));
