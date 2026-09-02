#!/usr/bin/env node
/**
 * One-time migration: backfills state 3038 (the only state that existed before the
 * multi-state rollout — see the plan) onto every existing alliance and everything scoped by
 * an alliance ID.
 *
 * What it does, per the plan's "Migration of existing data and accounts" section:
 *   1. Creates states/3038.
 *   2. For every alliances/{oldId} doc that doesn't already have a stateId (so this is safe
 *      to re-run if it's interrupted partway through): creates alliances/3038-{oldId} with
 *      stateId/slug added, deletes the old doc.
 *   3. Rewrites the `allianceId` field on every players/tasks/assignments/wiki_articles/
 *      article_feedback/admin_feedback doc that referenced an old bare alliance ID, to the
 *      new "3038-{oldId}" composite.
 *
 * Requires a signed-in superadmin (alliances/states writes are superadmin/state_admin-only
 * per firestore.rules) — pass credentials via MIGRATION_EMAIL / MIGRATION_PASSWORD.
 *
 * Usage:
 *   Against the emulator (safe, default):
 *     npx firebase-tools emulators:exec --only firestore,auth \
 *       "MIGRATION_EMAIL=... MIGRATION_PASSWORD=... node scripts/migrate-state-3038.mjs --emulator"
 *
 *   Against production — ONLY at the scheduled cutover, per the rollout plan, never before:
 *     MIGRATION_EMAIL=... MIGRATION_PASSWORD=... node scripts/migrate-state-3038.mjs --project tal-coordinator --yes
 *
 * --dry-run prints what it would do without writing anything.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
// Inlined rather than imported from src/environments/environment.ts — this is a plain Node
// ESM script with no TypeScript loader, and the config is already public by design (see this
// repo's README: Firebase web API keys are meant to be public, security lives in the rules).
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes',
  authDomain: 'tal-coordinator.firebaseapp.com',
  projectId: 'tal-coordinator',
  storageBucket: 'tal-coordinator.firebasestorage.app',
  messagingSenderId: '931922842986',
  appId: '1:931922842986:web:2d532a4613cd5d5c4fc113',
};

const STATE_ID = '3038';
const ALLIANCE_SCOPED_COLLECTIONS = [
  'players',
  'tasks',
  'assignments',
  'wiki_articles',
  'article_feedback',
  'admin_feedback',
];
const BATCH_LIMIT = 450; // Firestore's hard cap is 500 — leave headroom.

function parseArgs(argv) {
  return {
    emulator: argv.includes('--emulator'),
    dryRun: argv.includes('--dry-run'),
    yes: argv.includes('--yes'),
    project: argv.includes('--project') ? argv[argv.indexOf('--project') + 1] : FIREBASE_CONFIG.projectId,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.emulator && !args.dryRun && !args.yes) {
    console.error('Refusing to run against a real project without --yes (or use --dry-run / --emulator first).');
    process.exit(1);
  }

  const app = initializeApp({ ...FIREBASE_CONFIG, projectId: args.project });
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (args.emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const email = process.env.MIGRATION_EMAIL;
  const password = process.env.MIGRATION_PASSWORD;
  if (!email || !password) {
    console.error('Set MIGRATION_EMAIL and MIGRATION_PASSWORD to a superadmin account.');
    process.exit(1);
  }
  await signInWithEmailAndPassword(auth, email, password);

  console.log(`Target: ${args.emulator ? 'EMULATOR' : args.project} ${args.dryRun ? '(dry run)' : ''}`);

  // 1. states/3038
  if (args.dryRun) {
    console.log(`Would create states/${STATE_ID}`);
  } else {
    await setDoc(doc(db, `states/${STATE_ID}`), { id: STATE_ID, createdAt: serverTimestamp() }, { merge: true });
    console.log(`states/${STATE_ID} ensured`);
  }

  // 2. Migrate alliances that don't already have a stateId.
  const allianceSnap = await getDocs(collection(db, 'alliances'));
  const idMap = new Map(); // oldId -> newId
  const legacyAlliances = allianceSnap.docs.filter((d) => !d.data().stateId);

  for (const d of legacyAlliances) {
    const oldId = d.id;
    const newId = `${STATE_ID}-${oldId}`;
    idMap.set(oldId, newId);
    if (args.dryRun) {
      console.log(`Would migrate alliances/${oldId} -> alliances/${newId}`);
      continue;
    }
    await setDoc(doc(db, `alliances/${newId}`), {
      ...d.data(),
      id: newId,
      stateId: STATE_ID,
      slug: oldId,
    });
    await deleteDoc(doc(db, `alliances/${oldId}`));
    console.log(`alliances/${oldId} -> alliances/${newId}`);
  }

  if (idMap.size === 0) {
    console.log('No legacy (non-state-scoped) alliances found — nothing to migrate there.');
  }

  // 3. Rewrite allianceId on every scoped collection.
  for (const collectionName of ALLIANCE_SCOPED_COLLECTIONS) {
    const snap = await getDocs(collection(db, collectionName));
    const toRewrite = snap.docs.filter((d) => idMap.has(d.data().allianceId));
    if (toRewrite.length === 0) {
      console.log(`${collectionName}: nothing to rewrite`);
      continue;
    }
    if (args.dryRun) {
      console.log(`Would rewrite ${toRewrite.length} doc(s) in ${collectionName}`);
      continue;
    }
    for (let i = 0; i < toRewrite.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const d of toRewrite.slice(i, i + BATCH_LIMIT)) {
        batch.update(d.ref, { allianceId: idMap.get(d.data().allianceId) });
      }
      await batch.commit();
    }
    console.log(`${collectionName}: rewrote ${toRewrite.length} doc(s)`);
  }

  console.log(args.dryRun ? 'Dry run complete — nothing was written.' : 'Migration complete.');
}

main()
  .then(() => process.exit(0)) // the Firestore/Auth SDKs keep gRPC/network handles open otherwise — Node would hang instead of exiting
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
