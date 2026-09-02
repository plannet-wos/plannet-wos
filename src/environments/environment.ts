export const environment = {
  production: false,
  // The three state-gated sister apps' Hosting URLs — kept here (not hardcoded in
  // dashboard.ts) so the staging build configuration can point them at the staging
  // deploys instead. battle-calculator/furnace-calculator stay hardcoded in
  // dashboard.ts: they're untouched by the multi-state rollout and have no staging
  // equivalent.
  sisterApps: {
    foundryPlanner: 'https://foundry-planner.web.app',
    svsPrep: 'https://svs-prep.web.app',
    allianceWiki: 'https://alliance-wiki.web.app',
  },
  firebase: {
    apiKey: "AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes",
    authDomain: "tal-coordinator.firebaseapp.com",
    projectId: "tal-coordinator",
    storageBucket: "tal-coordinator.firebasestorage.app",
    messagingSenderId: "931922842986",
    appId: "1:931922842986:web:2d532a4613cd5d5c4fc113",
    measurementId: "G-HZFTHX19LP"
  }
};
