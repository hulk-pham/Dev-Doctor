# sample-broken-app

This folder is **sample data** for Dev Doctor. The problems are intentional:

- `node_modules` is missing
- `engines.node` is `>=18 <20`
- `.env` is missing the `API_TOKEN` name from `.env.example`
- both `package-lock.json` and `pnpm-lock.yaml` exist
- `src/uncommitted.js` is an uncommitted Git change after `npm run prepare:fixture`

The value in `.env` is fake. Do not replace it with a real secret.
