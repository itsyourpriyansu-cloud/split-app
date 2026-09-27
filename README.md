# Roomie Ledger

A mobile-first shared-expense PWA for roommates. The frontend is Vite + React and is ready for Vercel. The API is a Cloudflare Worker backed by its own D1 database.

## Resource isolation

This project deliberately uses new resource names:

- Worker: `roomie-ledger-api`
- D1 database: `roomie-ledger-db`
- D1 binding: `ROOMIE_DB`

It does not reference, migrate, or modify the existing trade app or any of its bindings.

## Included

- Create a private household and share an 8-character join code
- Pick a member on each phone; the device keeps a 180-day session
- Add equal-split expenses for any subset of members
- Monthly and day-by-day activity views
- Per-member balances and simplified settlement suggestions
- Record real repayments so outstanding balances reduce correctly
- Offline read cache and an idempotent mutation outbox that retries on reconnect
- Soft deletion and a server-side audit trail
- Installable PWA shell
- D1 migrations, automatic point-in-time recovery, and an export command

## Local development

```powershell
npm install
npm run db:migrate:local
```

Run these in two terminals:

```powershell
npm run dev:api
npm run dev
```

The web app opens at `http://localhost:5173` and calls the Worker at `http://localhost:8788`. This dedicated port avoids colliding with the existing trade app currently using `8787`.

## Cloudflare deployment

Wrangler automatic provisioning creates a **new** D1 database from the binding in `worker/wrangler.jsonc` when the API is deployed. It writes the generated resource ID back into the config.

```powershell
npx wrangler login
npm run deploy:api
npm run db:migrate:remote
```

Copy the deployed `workers.dev` URL for the Vercel environment variable below. Test the API with `/health` before deploying the frontend.

## Vercel deployment

Set `VITE_API_URL` to the Worker URL, without a trailing slash, for Production and Preview. Then deploy:

```powershell
npx vercel login
npx vercel env add VITE_API_URL production
npx vercel env add VITE_API_URL preview
npm run deploy:web
```

For a dashboard-only deployment, import `itsyourpriyansu-cloud/split-app` in Vercel, keep the detected **Vite** settings, and add one environment variable:

| Name | Value |
| --- | --- |
| `VITE_API_URL` | Your deployed `https://roomie-ledger-api.<account>.workers.dev` URL |

Vercel will use the checked-in `vercel.json`, run `npm run build`, and publish `dist` automatically. The frontend should only be published after the Worker is deployed and its `/health` endpoint returns `{ "ok": true }`.

If Vercel gives the project a name other than `roomie-ledger`, add its exact origin to `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` and redeploy the Worker.

## Backups and recovery

D1 Time Travel is automatic. On the free Workers plan it supports point-in-time recovery within Cloudflare's current free retention window. Create a longer-lived SQL export whenever needed:

```powershell
npm run db:backup:remote
```

Backup exports are ignored by Git because they contain private household data. Store them in a separate encrypted location.

## Verification

```powershell
npm run check
npx wrangler deploy --dry-run --config worker/wrangler.jsonc
```
