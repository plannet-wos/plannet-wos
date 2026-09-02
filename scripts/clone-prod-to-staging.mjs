#!/usr/bin/env node
/**
 * One-off staging tool (NOT part of the real cutover — migrate-state-3038.mjs is the
 * in-place script used for that): clones real data from tal-coordinator into
 * plannet-wos-staging, tagged as state 3038, so staging looks like a realistic snapshot of
 * what the real cutover will produce.
 *
 * Reads from tal-coordinator with a read-only (roles/datastore.viewer) grant on the same
 * service account used for staging writes — this script never calls a write/update/delete
 * method against the source project, only .get()/.listDocuments()/.stream().
 *
 * Collections cloned (doc IDs preserved except alliances, which get the composite rewrite —
 * see migrate-state-3038.mjs for why):
 *   alliances            -> composite id "3038-{oldId}", stateId+slug added
 *   players/tasks/assignments/wiki_articles/article_feedback/admin_feedback
 *                        -> allianceId rewritten via the alliances id map, same doc ID
 *   svs_forms            -> stateId: '3038' added, same doc ID (formId)
 *   svs_submissions/svs_assignments -> copied as-is (keyed by formId, not allianceId)
 *
 * Usage:
 *   MIGRATION_SA=/path/to/staging-sa.json node scripts/clone-prod-to-staging.mjs [--dry-run]
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const SOURCE_PROJECT = 'tal-coordinator';
const DEST_PROJECT = 'plannet-wos-staging';
const STATE_ID = '3038';
const dryRun = process.argv.includes('--dry-run');

const saPath = process.env.MIGRATION_SA;
if (!saPath) {
  console.error('Set MIGRATION_SA to the service account JSON path.');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));

const sourceApp = initializeApp({ credential: cert(sa), projectId: SOURCE_PROJECT }, 'source');
const destApp = initializeApp({ credential: cert(sa), projectId: DEST_PROJECT }, 'dest');
const source = getFirestore(sourceApp);
const dest = getFirestore(destApp);

console.log(`Cloning ${SOURCE_PROJECT} -> ${DEST_PROJECT} as state ${STATE_ID} ${dryRun ? '(dry run)' : ''}`);

if (!dryRun) {
  await dest.doc(`states/${STATE_ID}`).set({ id: STATE_ID, createdAt: Date.now() }, { merge: true });
}

// --- alliances: composite rewrite, build the id map every other collection needs ---
const idMap = new Map(); // oldId -> newId
const allianceSnap = await source.collection('alliances').get();
for (const d of allianceSnap.docs) {
  const oldId = d.id;
  const newId = `${STATE_ID}-${oldId}`;
  idMap.set(oldId, newId);
  if (dryRun) {
    console.log(`Would clone alliances/${oldId} -> alliances/${newId}`);
    continue;
  }
  await dest.doc(`alliances/${newId}`).set({ ...d.data(), id: newId, stateId: STATE_ID, slug: oldId });
}
console.log(`alliances: ${idMap.size} doc(s)${dryRun ? ' would be' : ''} cloned`);

// --- allianceId-scoped collections: same doc ID, allianceId rewritten via idMap ---
const ALLIANCE_SCOPED = ['players', 'tasks', 'assignments', 'wiki_articles', 'article_feedback', 'admin_feedback'];
for (const name of ALLIANCE_SCOPED) {
  const snap = await source.collection(name).get();
  let cloned = 0, skipped = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const newAllianceId = idMap.get(data.allianceId);
    if (!newAllianceId) {
      skipped++; // doc references an alliance that doesn't exist in prod's alliances collection — leave it out rather than guess
      continue;
    }
    cloned++;
    if (dryRun) continue;
    await dest.doc(`${name}/${d.id}`).set({ ...data, allianceId: newAllianceId });
  }
  console.log(`${name}: ${cloned} doc(s)${dryRun ? ' would be' : ''} cloned${skipped ? `, ${skipped} skipped (no matching alliance)` : ''}`);
}

// --- svs_forms: stamp stateId, same doc ID ---
{
  const snap = await source.collection('svs_forms').get();
  for (const d of snap.docs) {
    if (dryRun) { console.log(`Would clone svs_forms/${d.id}`); continue; }
    await dest.doc(`svs_forms/${d.id}`).set({ ...d.data(), stateId: STATE_ID });
  }
  console.log(`svs_forms: ${snap.size} doc(s)${dryRun ? ' would be' : ''} cloned`);
}

// --- svs_submissions/svs_assignments: copied as-is, keyed by formId not allianceId ---
for (const name of ['svs_submissions', 'svs_assignments']) {
  const snap = await source.collection(name).get();
  for (const d of snap.docs) {
    if (dryRun) continue;
    await dest.doc(`${name}/${d.id}`).set(d.data());
  }
  console.log(`${name}: ${snap.size} doc(s)${dryRun ? ' would be' : ''} cloned`);
}

console.log(dryRun ? 'Dry run complete — nothing was written to staging.' : 'Clone complete.');
