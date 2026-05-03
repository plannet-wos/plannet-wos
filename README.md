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
