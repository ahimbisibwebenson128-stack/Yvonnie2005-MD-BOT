# YVONNIE2005 BOT — deployment and pairing

## Hosting layout

- Render runs the persistent WhatsApp socket and database-backed auth store.
- Vercel is the public branded portal and reverse proxy only.
- Keep the existing Render service and database. Do not delete session records to troubleshoot ordinary pairing failures.

## Required Render environment variables

Keep the existing values unless explicitly changing them:

- `SESSION=main`
- `BOT_NAME=YVONNIE2005`
- `BOT_INFO=YVONNIE2005;YVONNIE2005;default`
- `SUDO=256746244963`
- `PAIRING_API_KEY` = the existing private owner key (never commit it)
- `USE_SERVER=true`

Do not put the pairing key in GitHub, the ZIP, Vercel frontend source, or screenshots.

## Pairing flow

1. Open `https://yvonnie2005-md-bot-2.vercel.app/`.
2. Wait until the portal says the bot is ready.
3. Enter the configured owner number and the existing owner access key.
4. Request exactly one code. The server caches that request and will not issue a competing code for the same session.
5. In WhatsApp, choose Settings → Linked devices → Link a device → Link with phone number instead. Enter the code immediately.
6. Wait for the Render service to reconnect and report connected.

If WhatsApp immediately rejects the code, stop retrying. Repeated requests can invalidate pairing state or trigger WhatsApp limits. Check the Render logs and the Baileys version before another attempt.

## Uploading a replacement ZIP

Upload `YVONNIE2005-MD-BOT-READY.zip` to the root of the GitHub `main` branch. The existing GitHub Actions workflow extracts it, validates JavaScript syntax, replaces project source, preserves private runtime data, removes the uploaded ZIP, and commits the installed source. Render is configured for automatic deploys from `main`; verify the new deployment before testing the portal.

The ZIP intentionally excludes `.env` files, database files, WhatsApp auth/session data, `.git`, and `node_modules`.
