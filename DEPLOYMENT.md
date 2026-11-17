# YVONNIE2005 BOT deployment notes

## Important architecture

The WhatsApp Baileys socket must run in a persistent Node.js service. Keep the bot process on Render (or another always-on Node host). Vercel is used as the public website/reverse proxy only; it forwards requests to the Render service through `vercel.json`. Do not try to run the WhatsApp socket as a Vercel serverless function.

## Render environment variables

Set these in the existing Render service, then deploy the latest commit/archive:

- `SESSION=main`
- `BOT_NAME=YVONNIE2005`
- `BOT_INFO=YVONNIE2005;YVONNIE2005;default`
- `SUDO=2567XXXXXXXX` (owner number, digits only)
- `PAIRING_API_KEY=` a long private random secret. Use the same secret in the pairing portal's Owner access key field. Never publish it or put it in frontend source.
- `USE_SERVER=true`

Do not set `PAIR_NUMBER` for the new web flow. The owner enters the phone number in the portal and the API asks Baileys for a pairing code.

## Pair WhatsApp

1. Open the Vercel site: `https://yvonnie2005-md-bot-2.vercel.app/`.
2. Enter the WhatsApp number with country code, digits only (Uganda example format: `2567XXXXXXXX`; use the actual number).
3. Enter the exact `PAIRING_API_KEY` configured in Render.
4. Select **Generate pairing code**.
5. In WhatsApp, open **Settings → Linked devices → Link a device → Link with phone number instead**, then enter the code.
6. Keep the Render service running so the session can finish linking and persist.

The endpoint returns no pairing code unless the owner key is correct. If the session is already linked, the user must intentionally clear that session before linking a different WhatsApp account.

## Deployment order

1. Deploy this project to the existing Render service first and configure the environment variables above.
2. Confirm the Render root URL shows the YVONNIE2005 pairing portal.
3. Deploy the same repository to the existing Vercel project so the `vercel.json` rewrite becomes active.
4. Open the Vercel domain and test the pairing flow.
