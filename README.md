# Plannet WOS

The hub app for the **Whiteout Survival** tools collection — landing dashboard with auth-gated entry points to the other apps in the suite.

Live: **https://plannet-wos.web.app**
Source: [plannet-wos org on GitHub](https://github.com/plannet-wos)

## Sister apps

- [alliance-wiki](https://github.com/plannet-wos/alliance-wiki) — alliance knowledge base
- [battle-calculator](https://github.com/plannet-wos/battle-calculator) — solo PvP lineup optimizer
- [foundry-planner](https://github.com/plannet-wos/foundry-planner) — Foundry Battle event planner
- [furnace-calculator](https://github.com/plannet-wos/furnace-calculator) — furnace upgrade calculator
- [wos-simulator](https://github.com/plannet-wos/wos-simulator) — Python battle simulator (forked from [ryo-HIT-1589/wos-simulator](https://github.com/ryo-HIT-1589/wos-simulator))

## Setup

```bash
npm install
npm start
```

Then open `http://localhost:4205/`. To run multiple apps side-by-side, override the port with `npm start -- --port 4XXX`.

## Firebase config

The Firebase web API key in `src/environments/environment.ts` is intentionally checked in. Firebase web API keys are [designed to be public](https://firebase.google.com/docs/projects/api-keys) — security is enforced by Firestore/Auth rules, not the key.

### Firestore rules ownership

**This repo is the only place `firestore.rules` is allowed to live and be deployed from.**
`tal-coordinator` is a single shared Firestore database (still on the free Spark plan — no
per-app database isolation), so its security rules are one project-wide file, not something each
app can own independently. Foundry Planner, Alliance Wiki, SvS Preparation and battle-calculator's
`saves` collection are all defined in [`firestore.rules`](firestore.rules) here.

Those other app repos do **not** carry their own copy of `firestore.rules`, `firestore.indexes.json`,
or a `"firestore"` key in `firebase.json` — on purpose. Firestore rules used to be duplicated across
every app repo that used Firestore, which meant any plain `firebase deploy` (not scoped with
`--only hosting`) from any of them could silently redeploy a stale copy and default-deny collections
it didn't know about. (This wasn't hypothetical — battle-calculator's copy had drifted and would
have done exactly that.)

**To add or change a Firestore collection for any app:** edit `firestore.rules` here, then deploy
from this repo:

```bash
firebase deploy --only firestore:rules --project tal-coordinator
```

An app's own repo only ever needs `firebase deploy --only hosting` — its `firebase.json` has no
`"firestore"` key, so nothing else is at risk of being touched.

## Contributing

Fork the repo, create a branch, open a PR. No write access needed.

<details>
<summary>Angular CLI commands</summary>

```bash
ng generate component component-name   # scaffold a component
ng build                                # production build into dist/
ng test                                 # run Vitest unit tests
```

For more, see the [Angular CLI reference](https://angular.dev/tools/cli).

</details>
