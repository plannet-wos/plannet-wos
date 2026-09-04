#!/usr/bin/env node
/**
 * One-time migration: backfills state 3038 (the only state that existed before the
 * multi-state rollout — see the plan) onto every existing alliance and everything scoped by
 * an alliance ID.
 *
 * What it does, per the plan's "Migration of existing data and accounts" section:
 *   1. Creates states/3038.
 *   2. For every alliances/{oldId} doc that doesn't already have a stateId: creates
 *      alliances/3038-{oldId} with stateId/slug added, deletes the old doc.
 *   3. Rewrites the `allianceId` field on every players/tasks/assignments/wiki_articles/
 *      article_feedback/admin_feedback doc that referenced an old bare alliance ID, to the
 *      new "3038-{oldId}" composite.
 *   4. Stamps stateId: '3038' onto every svs_forms doc that doesn't already have one (same
 *      doc ID, no other field touched) — svs-prep's home page lists rounds by stateId, so a
 *      round left without one becomes invisible there the moment the new code goes live, even
 *      though direct /survey/:id links to it keep working (those look up by doc ID, not
 *      state). svs_submissions/svs_assignments need no equivalent: neither is ever queried by
 *      stateId anywhere in the app, only by form ID.
 *
 * Resumable: the old->new id map step 3 uses is rebuilt from the CURRENT state of the
 * alliances collection after step 2 (every alliance with stateId=='3038' contributes
 * slug->id), not just from whatever step 2 did in this particular run. That means a second
 * run after a crash midway through step 3 — or one that starts after step 2 already fully
 * completed in a prior run — still finds every alliance to map against and finishes the
 * rewrite, instead of seeing an empty map and silently doing nothing. Every write here is
 * also naturally idempotent on its own (setDoc/batch.update with the same target values), so
 * re-running this after any partial failure, at any point, converges to the same end state.
 *
 * Requires a signed-in superadmin (alliances/states writes are superadmin/state_admin-only
 * per firestore.rules) — pass credentials via MIGRATION_EMAIL / MIGRATION_PASSWORD. If that
 * account has TOTP enrolled (recommended, but not required for superadmin — see roles.ts),
 * also set MIGRATION_OTP to a currently-valid 6-digit code from its authenticator app; the
 * script will tell you if one was needed and wasn't provided, rather than failing opaquely.
 *
 * Usage:
 *   Against the emulator (safe, default):
 *     npx firebase-tools emulators:exec --only firestore,auth \
 *       "MIGRATION_EMAIL=... MIGRATION_PASSWORD=... node scripts/migrate-state-3038.mjs --emulator"
 *
 *   Against production — ONLY at the scheduled cutover, per the rollout plan, never before:
 *     MIGRATION_EMAIL=... MIGRATION_PASSWORD=... [MIGRATION_OTP=...] \
 *       node scripts/migrate-state-3038.mjs --project tal-coordinator --yes
 *
 * --dry-run prints what it would do without writing anything.
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
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

// Rewrites the keys of a { [allianceId]: value } map. Keys with no match in idMap are left
// as-is rather than dropped, so a reference to an alliance outside this migration's scope
// doesn't silently vanish.
function rewriteAllianceKeyedMap(map, idMap) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [idMap.get(k) ?? k, v]));
}

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
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err?.code !== 'auth/multi-factor-auth-required') throw err;
    const otp = process.env.MIGRATION_OTP;
    if (!otp) {
      console.error(
        'This account has TOTP enrolled — set MIGRATION_OTP to a currently-valid 6-digit code ' +
        'from its authenticator app and re-run.',
      );
      process.exit(1);
    }
    const resolver = getMultiFactorResolver(auth, err);
    const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw new Error('Account requires MFA but has no TOTP factor enrolled — unexpected, check its accounts/{uid} doc.');
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, otp);
    await resolver.resolveSignIn(assertion);
  }

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
  const legacyAlliances = allianceSnap.docs.filter((d) => !d.data().stateId);

  if (legacyAlliances.length === 0) {
    console.log('No legacy (non-state-scoped) alliances found — nothing to migrate there.');
  }

  for (const d of legacyAlliances) {
    const oldId = d.id;
    const newId = `${STATE_ID}-${oldId}`;
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

  // Build the old->new id map for step 3 from the CURRENT state of the collection (a fresh
  // read, post-migration), not from what step 2 did in just this run — every alliance with
  // stateId=='3038' contributes slug->id, whether it was migrated just now or in an earlier,
  // interrupted run. That's what makes step 3 resumable on its own: re-running after a crash
  // partway through it (or a run that starts after step 2 already fully completed) still
  // finds every alliance to map against.
  const idMap = args.dryRun
    ? new Map(legacyAlliances.map((d) => [d.id, `${STATE_ID}-${d.id}`]))
    : new Map(
        (await getDocs(collection(db, 'alliances'))).docs
          .filter((d) => d.data().stateId === STATE_ID && d.data().slug)
          .map((d) => [d.data().slug, d.id]),
      );

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
        const data = d.data();
        const update = { allianceId: idMap.get(data.allianceId) };
        // players' legionByAlliance/tierByAlliance are { [allianceId]: value } maps (cross-
        // alliance events — see player.model.ts) — their KEYS need the same rewrite as the
        // top-level allianceId field, or cross-alliance legion/tier lookups silently break
        // once the alliance they're keyed by no longer exists under its old bare ID.
        if (collectionName === 'players') {
          if (data.legionByAlliance) {
            update.legionByAlliance = rewriteAllianceKeyedMap(data.legionByAlliance, idMap);
          }
          if (data.tierByAlliance) {
            update.tierByAlliance = rewriteAllianceKeyedMap(data.tierByAlliance, idMap);
          }
        }
        batch.update(d.ref, update);
      }
      await batch.commit();
    }
    console.log(`${collectionName}: rewrote ${toRewrite.length} doc(s)`);
  }

  // 4. Stamp stateId onto legacy svs_forms docs.
  const svsFormsSnap = await getDocs(collection(db, 'svs_forms'));
  const legacySvsForms = svsFormsSnap.docs.filter((d) => !d.data().stateId);
  if (legacySvsForms.length === 0) {
    console.log('svs_forms: nothing to stamp');
  } else if (args.dryRun) {
    console.log(`Would stamp stateId onto ${legacySvsForms.length} svs_forms doc(s)`);
  } else {
    for (const d of legacySvsForms) {
      await setDoc(doc(db, `svs_forms/${d.id}`), { stateId: STATE_ID }, { merge: true });
    }
    console.log(`svs_forms: stamped stateId onto ${legacySvsForms.length} doc(s)`);
  }

  console.log(args.dryRun ? 'Dry run complete — nothing was written.' : 'Migration complete.');
}

main()
  .then(() => process.exit(0)) // the Firestore/Auth SDKs keep gRPC/network handles open otherwise — Node would hang instead of exiting
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
