/**
 * Integration test for migrate-state-3038.mjs, run against the emulator only:
 *   npx firebase-tools emulators:exec --only firestore,auth "node scripts/test-migration.mjs"
 *
 * Seeds a real superadmin (Auth emulator user + accounts/{uid} doc, the doc seeded by
 * bypassing rules the way hand-provisioning the real one does) plus legacy pre-migration
 * data (an alliance with no stateId, and players/tasks/assignments/wiki_articles referencing
 * it by bare ID), then runs the actual CLI script against that data and asserts the result.
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } from 'firebase/firestore';

const EMAIL = 'super-migration-test@example.com';
const PASSWORD = 'correct horse battery staple';

const FIREBASE_CONFIG = {
  apiKey: 'demo-key',
  authDomain: 'demo-tal-coordinator.firebaseapp.com',
  projectId: 'demo-tal-coordinator',
};

const authApp = initializeApp(FIREBASE_CONFIG, 'auth-seed');
const auth = getAuth(authApp);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
const uid = cred.user.uid;
console.log(`Seeded superadmin auth user: ${uid}`);

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-tal-coordinator',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, `accounts/${uid}`), {
    uid, email: EMAIL, role: 'superadmin', rank: 0, status: 'active', mfaEnrolled: true, requestedAt: 1,
  });
  // Legacy (pre-rollout) data: bare alliance ID, no stateId.
  await setDoc(doc(db, 'alliances/eagle'), { id: 'eagle', name: 'Eagle', createdAt: 1 });
  await setDoc(doc(db, 'players/p1'), {
    id: 'p1', allianceId: 'eagle', inGameName: 'Alice',
    // Cross-alliance event fields (see player.model.ts) — keyed by alliance ID, not just
    // referencing one in a plain field. 'eagle' should get rewritten same as allianceId
    // above; 'ghost' (an alliance outside this migration's scope) should be left as-is
    // rather than dropped.
    legionByAlliance: { eagle: 1, ghost: 2 },
    tierByAlliance: { eagle: 'whale' },
  });
  await setDoc(doc(db, 'tasks/t1'), { id: 't1', allianceId: 'eagle', name: 'Cannon' });
  await setDoc(doc(db, 'assignments/a1'), { id: 'a1', allianceId: 'eagle', playerId: 'p1' });
  await setDoc(doc(db, 'wiki_articles/w1'), {
    allianceId: 'eagle', title: 'Guide', content: 'x', status: 'published', createdAt: 1, updatedAt: 1,
  });
  // A second alliance already migrated (idempotency check) — must be left untouched.
  await setDoc(doc(db, 'alliances/3038-wolf'), { id: '3038-wolf', stateId: '3038', slug: 'wolf', name: 'Wolf', createdAt: 1 });
});
// Deliberately not calling testEnv.cleanup() here — it clears the emulator's Firestore data,
// which would wipe the fixtures we just seeded before the migration script ever reads them.
// The emulator process itself is torn down by `emulators:exec` when this whole script exits.

{
  const debugApp = initializeApp(FIREBASE_CONFIG, 'debug');
  const debugDb = getFirestore(debugApp);
  connectFirestoreEmulator(debugDb, '127.0.0.1', 8080);
  const { collection: col, getDocs: gd } = await import('firebase/firestore');
  const snap = await gd(col(debugDb, 'alliances'));
  console.log(`DEBUG: alliances collection has ${snap.size} doc(s): ${snap.docs.map((d) => d.id).join(', ')}`);
}

console.log('--- dry run ---');
execFileSync('node', ['scripts/migrate-state-3038.mjs', '--emulator', '--project', 'demo-tal-coordinator', '--dry-run'], {
  env: { ...process.env, MIGRATION_EMAIL: EMAIL, MIGRATION_PASSWORD: PASSWORD },
  stdio: 'inherit',
});

console.log('--- real run ---');
execFileSync('node', ['scripts/migrate-state-3038.mjs', '--emulator', '--project', 'demo-tal-coordinator'], {
  env: { ...process.env, MIGRATION_EMAIL: EMAIL, MIGRATION_PASSWORD: PASSWORD },
  stdio: 'inherit',
});

// --- assertions, reading back through a fresh client (still against the same emulator) ---
const checkApp = initializeApp(FIREBASE_CONFIG, 'check');
const db = getFirestore(checkApp);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const state = await getDoc(doc(db, 'states/3038'));
assert.equal(state.exists(), true, 'states/3038 should exist');

const oldAlliance = await getDoc(doc(db, 'alliances/eagle'));
assert.equal(oldAlliance.exists(), false, 'alliances/eagle should be gone');

const newAlliance = await getDoc(doc(db, 'alliances/3038-eagle'));
assert.equal(newAlliance.exists(), true, 'alliances/3038-eagle should exist');
assert.equal(newAlliance.data().stateId, '3038');
assert.equal(newAlliance.data().slug, 'eagle');

const player = await getDoc(doc(db, 'players/p1'));
assert.equal(player.data().allianceId, '3038-eagle', 'player.allianceId should be rewritten');
assert.deepEqual(player.data().legionByAlliance, { '3038-eagle': 1, ghost: 2 },
  'legionByAlliance keys should be rewritten, with the out-of-scope "ghost" key left as-is');
assert.deepEqual(player.data().tierByAlliance, { '3038-eagle': 'whale' },
  'tierByAlliance keys should be rewritten too');

const task = await getDoc(doc(db, 'tasks/t1'));
assert.equal(task.data().allianceId, '3038-eagle', 'task.allianceId should be rewritten');

const assignment = await getDoc(doc(db, 'assignments/a1'));
assert.equal(assignment.data().allianceId, '3038-eagle', 'assignment.allianceId should be rewritten');

const article = await getDoc(doc(db, 'wiki_articles/w1'));
assert.equal(article.data().allianceId, '3038-eagle', 'wiki_articles.allianceId should be rewritten');

const alreadyMigrated = await getDoc(doc(db, 'alliances/3038-wolf'));
assert.equal(alreadyMigrated.exists(), true, 'already-migrated alliance should be untouched');
assert.equal(alreadyMigrated.data().name, 'Wolf');

console.log('\nALL MIGRATION ASSERTIONS PASSED');
