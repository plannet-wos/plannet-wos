/**
 * Hierarchy-matrix tests for firestore.rules' accounts/alliances/states rules — the
 * multi-state rollout plan's "Verification" section, made executable.
 *
 * Run against the Firestore emulator only (no real project touched):
 *   npx firebase-tools emulators:exec --only firestore "node scripts/test-rules.mjs"
 *
 * Uses @firebase/rules-unit-testing's fake authenticated contexts, so the Auth emulator
 * isn't needed for this — rules only ever read `request.auth.uid`, which this library can
 * fabricate directly.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-tal-coordinator',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err.message ?? err);
    process.exitCode = 1;
  }
}

// --- seed fixtures, bypassing rules entirely ---
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const accounts = {
    super1: { uid: 'super1', email: 's@x.com', role: 'superadmin', rank: 0, status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'sa-3038': { uid: 'sa-3038', email: 'sa3038@x.com', role: 'state_admin', rank: 1, stateId: '3038', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'sa-9999': { uid: 'sa-9999', email: 'sa9999@x.com', role: 'state_admin', rank: 1, stateId: '9999', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'r5-eagle': { uid: 'r5-eagle', email: 'r5eagle@x.com', role: 'r5', rank: 2, stateId: '3038', allianceId: '3038-eagle', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'r5-wolf': { uid: 'r5-wolf', email: 'r5wolf@x.com', role: 'r5', rank: 2, stateId: '3038', allianceId: '3038-wolf', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'r5-pending-3038': { uid: 'r5-pending-3038', email: 'r5pending@x.com', role: 'r5', rank: 2, stateId: '3038', allianceId: '3038-bear', status: 'pending', mfaEnrolled: true, requestedAt: 1 },
    'r4-pending-nomfa': { uid: 'r4-pending-nomfa', email: 'r4nomfa@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-eagle', status: 'pending', mfaEnrolled: false, requestedAt: 1 },
    'r4-pending-mfa': { uid: 'r4-pending-mfa', email: 'r4mfa@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-eagle', status: 'pending', mfaEnrolled: true, requestedAt: 1 },
    'r4-active': { uid: 'r4-active', email: 'r4active@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-eagle', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'r4-active-2': { uid: 'r4-active-2', email: 'r4active2@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-eagle', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    // A state_admin who ALSO personally leads an alliance (allianceId set on their own
    // state_admin account) — the "most state admins are also their alliance's R5" case.
    'sa-falcon-leader': { uid: 'sa-falcon-leader', email: 'sfl@x.com', role: 'state_admin', rank: 1, stateId: '3038', allianceId: '3038-falcon', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'r4-falcon-pending': { uid: 'r4-falcon-pending', email: 'r4falcon@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-falcon', status: 'pending', mfaEnrolled: true, requestedAt: 1 },
    'r4-falcon-active': { uid: 'r4-falcon-active', email: 'r4falconactive@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-falcon', status: 'active', mfaEnrolled: true, requestedAt: 1 },
    'r5-pending-3038b': { uid: 'r5-pending-3038b', email: 'r5pendingb@x.com', role: 'r5', rank: 2, stateId: '3038', allianceId: '3038-hawk', status: 'pending', mfaEnrolled: true, requestedAt: 1 },
  };
  for (const [uid, data] of Object.entries(accounts)) {
    await setDoc(doc(db, `accounts/${uid}`), data);
  }
  await setDoc(doc(db, 'alliances/3038-eagle'), {
    id: '3038-eagle', stateId: '3038', slug: 'eagle', name: 'Eagle', createdAt: 1,
  });
});

// --- accounts: create (self-signup) ---
await check('candidate can create their own pending r5 request', async () => {
  const db = testEnv.authenticatedContext('newr5').firestore();
  await assertSucceeds(setDoc(doc(db, 'accounts/newr5'), {
    uid: 'newr5', email: 'new@x.com', role: 'r5', rank: 2, stateId: '3038', allianceId: '3038-eagle',
    status: 'pending', mfaEnrolled: false, requestedAt: Date.now(),
  }));
});

await check('candidate cannot self-request superadmin (rank 0)', async () => {
  const db = testEnv.authenticatedContext('sneaky').firestore();
  await assertFails(setDoc(doc(db, 'accounts/sneaky'), {
    uid: 'sneaky', email: 's@x.com', role: 'superadmin', rank: 0,
    status: 'pending', mfaEnrolled: false, requestedAt: Date.now(),
  }));
});

await check('candidate cannot claim mfaEnrolled true at signup time', async () => {
  const db = testEnv.authenticatedContext('cheater').firestore();
  await assertFails(setDoc(doc(db, 'accounts/cheater'), {
    uid: 'cheater', email: 'c@x.com', role: 'r4', rank: 3, stateId: '3038', allianceId: '3038-eagle',
    status: 'pending', mfaEnrolled: true, requestedAt: Date.now(),
  }));
});

// --- accounts: candidate's own mfaEnrolled flip ---
await check('candidate can flip their own mfaEnrolled while pending', async () => {
  const db = testEnv.authenticatedContext('r4-pending-nomfa').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/r4-pending-nomfa'), { mfaEnrolled: true }));
  // restore for later tests expecting it false
  await testEnv.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'accounts/r4-pending-nomfa'), { mfaEnrolled: false }, { merge: true }));
});

await check('candidate cannot self-approve (flip status) alongside mfaEnrolled', async () => {
  const db = testEnv.authenticatedContext('r4-pending-mfa').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r4-pending-mfa'), { mfaEnrolled: true, status: 'active' }));
});

// --- accounts: approval hierarchy ---
await check('superadmin approves a state_admin-scoped R5 pending request', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/r5-pending-3038'), {
    status: 'active', approvedBy: 'sa-3038', approvedAt: Date.now(),
  }));
});

await check('state_admin of a DIFFERENT state cannot approve that R5 request', async () => {
  await testEnv.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'accounts/r5-pending-3038'), { status: 'pending' }, { merge: true }));
  const db = testEnv.authenticatedContext('sa-9999').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r5-pending-3038'), {
    status: 'active', approvedBy: 'sa-9999', approvedAt: Date.now(),
  }));
});

await check('R5 approves an R4 pending request in its OWN alliance (mfa already true)', async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/r4-pending-mfa'), {
    status: 'active', approvedBy: 'r5-eagle', approvedAt: Date.now(),
  }));
});

await check('R5 cannot approve an R4 request that has not enrolled TOTP yet', async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r4-pending-nomfa'), {
    status: 'active', approvedBy: 'r5-eagle', approvedAt: Date.now(),
  }));
});

await check('R5 cannot approve/revoke an R4 in a DIFFERENT alliance', async () => {
  const db = testEnv.authenticatedContext('r5-wolf').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r4-active'), { status: 'suspended' }));
});

await check('R4 cannot manage anyone, not even another R4', async () => {
  const db = testEnv.authenticatedContext('r4-active').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r4-active-2'), { status: 'suspended' }));
});

// --- accounts: state_admin who also leads an alliance (allianceId set on their own account) ---
await check("state_admin who also leads an alliance approves an R4 pending request in THAT alliance", async () => {
  const db = testEnv.authenticatedContext('sa-falcon-leader').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/r4-falcon-pending'), {
    status: 'active', approvedBy: 'sa-falcon-leader', approvedAt: Date.now(),
  }));
});

await check("the same state_admin cannot manage an R4 in a DIFFERENT alliance, even though it's in their state", async () => {
  const db = testEnv.authenticatedContext('sa-falcon-leader').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r4-active'), { status: 'suspended' }));
});

await check("a PLAIN state_admin (no allianceId) cannot manage an R4 anywhere in their state — R4 administration requires personally leading that alliance", async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertFails(updateDoc(doc(db, 'accounts/r4-falcon-active'), { status: 'suspended' }));
});

await check("state_admin who also leads an alliance still approves R5 requests state-wide, unaffected — R5 administration was never alliance-restricted", async () => {
  const db = testEnv.authenticatedContext('sa-falcon-leader').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/r5-pending-3038b'), {
    status: 'active', approvedBy: 'sa-falcon-leader', approvedAt: Date.now(),
  }));
});

await check('R5 cannot create/manage alliances (rank too low)', async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertFails(setDoc(doc(db, 'alliances/3038-newone'), {
    id: '3038-newone', stateId: '3038', slug: 'newone', name: 'New One', createdAt: Date.now(),
  }));
});

// --- alliances: state scoping ---
await check('state_admin creates an alliance in their OWN state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertSucceeds(setDoc(doc(db, 'alliances/3038-newone'), {
    id: '3038-newone', stateId: '3038', slug: 'newone', name: 'New One', createdAt: Date.now(),
  }));
});

await check('state_admin cannot create an alliance in a DIFFERENT state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertFails(setDoc(doc(db, 'alliances/9999-sneaky'), {
    id: '9999-sneaky', stateId: '9999', slug: 'sneaky', name: 'Sneaky', createdAt: Date.now(),
  }));
});

// --- states: superadmin only ---
await check('superadmin can register a new state', async () => {
  const db = testEnv.authenticatedContext('super1').firestore();
  await assertSucceeds(setDoc(doc(db, 'states/4001'), { id: '4001', createdAt: Date.now() }));
});

await check('state_admin cannot register a new state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertFails(setDoc(doc(db, 'states/4002'), { id: '4002', createdAt: Date.now() }));
});

// --- svs_forms: state_admin-or-above, scoped to their own state ---
await check('superadmin can create an svs_forms round for a state', async () => {
  const db = testEnv.authenticatedContext('super1').firestore();
  await assertSucceeds(setDoc(doc(db, 'svs_forms/round1'), {
    stateId: '3038', highestFcLevel: 8, battleDate: '2026-09-05',
    submissionsOpenAt: 1, submissionsCloseAt: 2,
  }));
});

await check('state_admin can create an svs_forms round for their OWN state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertSucceeds(setDoc(doc(db, 'svs_forms/round2'), {
    stateId: '3038', highestFcLevel: 8, battleDate: '2026-09-05',
    submissionsOpenAt: 1, submissionsCloseAt: 2,
  }));
});

await check('state_admin cannot create an svs_forms round for a DIFFERENT state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertFails(setDoc(doc(db, 'svs_forms/round3'), {
    stateId: '9999', highestFcLevel: 8, battleDate: '2026-09-05',
    submissionsOpenAt: 1, submissionsCloseAt: 2,
  }));
});

await check('R5 cannot create an svs_forms round at all (below state_admin)', async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertFails(setDoc(doc(db, 'svs_forms/round4'), {
    stateId: '3038', highestFcLevel: 8, battleDate: '2026-09-05',
    submissionsOpenAt: 1, submissionsCloseAt: 2,
  }));
});

await check('state_admin can delete an svs_forms round in their OWN state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertSucceeds(deleteDoc(doc(db, 'svs_forms/round2')));
});

// --- alliances: the narrow R4/R5 operational-fields carve-out (foundry-planner's admin-dashboard) ---
await check("R5 can update their OWN alliance's battle-time fields", async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertSucceeds(updateDoc(doc(db, 'alliances/3038-eagle'), { finalTimeL1: '20:00', finalTimeL2: '21:00' }));
});

await check("R4 can update their OWN alliance's finalTime field too — same carve-out, not just R5", async () => {
  const db = testEnv.authenticatedContext('r4-active').firestore();
  await assertSucceeds(updateDoc(doc(db, 'alliances/3038-eagle'), { finalTime: '20:00' }));
});

await check('R5 cannot rename their alliance through the operational-fields carve-out', async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertFails(updateDoc(doc(db, 'alliances/3038-eagle'), { name: 'Renamed' }));
});

await check("R5 cannot set the state-event `type` field through the operational-fields carve-out — only state_admin/superadmin mint those, at creation", async () => {
  const db = testEnv.authenticatedContext('r5-eagle').firestore();
  await assertFails(updateDoc(doc(db, 'alliances/3038-eagle'), { type: 'state_event' }));
});

await check('state_admin can create a state-event shell alliance in their own state', async () => {
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertSucceeds(setDoc(doc(db, 'alliances/3038-s38'), {
    id: '3038-s38', stateId: '3038', slug: 's38', name: 'S38 Foundry Event',
    type: 'state_event', createdAt: Date.now(),
  }));
});

await check("R5 of a DIFFERENT alliance cannot touch eagle's battle times", async () => {
  const db = testEnv.authenticatedContext('r5-wolf').firestore();
  await assertFails(updateDoc(doc(db, 'alliances/3038-eagle'), { finalTimeL1: '22:00' }));
});

// --- multiple accounts sharing a rank+scope (explicitly requested: shared roles) ---
await check('superadmin can approve a SECOND state_admin for a state that already has one', async () => {
  await testEnv.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'accounts/sa-3038-second'), {
      uid: 'sa-3038-second', email: 'sa3038b@x.com', role: 'state_admin', rank: 1, stateId: '3038',
      status: 'pending', mfaEnrolled: true, requestedAt: 1,
    }));
  const db = testEnv.authenticatedContext('super1').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/sa-3038-second'), {
    status: 'active', approvedBy: 'super1', approvedAt: Date.now(),
  }));
  // both state admins for 3038 stay independently active and equally able to act.
  const db2 = testEnv.authenticatedContext('sa-3038-second').firestore();
  await assertSucceeds(setDoc(doc(db2, 'alliances/3038-second-admin-check'), {
    id: '3038-second-admin-check', stateId: '3038', slug: 'second-admin-check', name: 'Check', createdAt: 1,
  }));
});

await check('a state_admin can approve a SECOND R5 for an alliance that already has one', async () => {
  await testEnv.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'accounts/r5-eagle-second'), {
      uid: 'r5-eagle-second', email: 'r5eagle2@x.com', role: 'r5', rank: 2, stateId: '3038', allianceId: '3038-eagle',
      status: 'pending', mfaEnrolled: true, requestedAt: 1,
    }));
  const db = testEnv.authenticatedContext('sa-3038').firestore();
  await assertSucceeds(updateDoc(doc(db, 'accounts/r5-eagle-second'), {
    status: 'active', approvedBy: 'sa-3038', approvedAt: Date.now(),
  }));
  // both R5s for eagle stay independently able to approve/revoke that alliance's R4s.
  const db2 = testEnv.authenticatedContext('r5-eagle-second').firestore();
  await assertSucceeds(updateDoc(doc(db2, 'accounts/r4-active-2'), { status: 'suspended' }));
});

await testEnv.cleanup();

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
