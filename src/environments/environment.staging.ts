// Points at plannet-wos-staging — a throwaway Firebase project for verifying the multi-state
// rollout (see the plan) before the real cutover against tal-coordinator. Swapped in via the
// `staging` build configuration (see angular.json's fileReplacements) — never used by default.
export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyBI8SXYmf4AbOy-11VQn7qbhDagaxV-Rok",
    authDomain: "plannet-wos-staging.firebaseapp.com",
    projectId: "plannet-wos-staging",
    storageBucket: "plannet-wos-staging.firebasestorage.app",
    messagingSenderId: "305181543070",
    appId: "1:305181543070:web:f19d861a96aeb2c001c98f"
  }
};
