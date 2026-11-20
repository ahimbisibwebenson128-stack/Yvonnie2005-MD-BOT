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
- `GEMINI_API_KEY` = your private Gemini API key if you want chatbot features (never commit it)
- `USE_SERVER=true`

Do not put the pairing key in GitHub, the ZIP, Vercel frontend source, or screenshots.

## Pairing flow

1. Open `https://yvonnie2005-md-bot.vercel.app/`.
2. Wait until the portal says the bot is ready.
3. Enter the configured owner number and the existing owner access key.
4. Choose either Generate pairing code or Display QR code. Both methods are shown on the portal. Use one method for a single linking attempt; QR data is returned only after owner authentication and expires quickly.
5. For code mode, in WhatsApp choose Settings → Linked devices → Link a device → Link with phone number instead. Enter the code immediately. For QR mode, choose Link a device and scan the QR.
6. Wait for the Render service to reconnect and report connected.

If WhatsApp immediately rejects the code, stop retrying. Repeated requests can invalidate pairing state or trigger WhatsApp limits. Check the Render logs and the Baileys version before another attempt.

## Uploading a replacement ZIP

The repository already contains a GitHub Actions ZIP installer at `.github/workflows/install-project-zip.yml`. Upload a release ZIP to the repository root on the `main` branch. Its filename must begin with `YVONNIE2005-MD-BOT-READY` and end in `.zip` (for example `YVONNIE2005-MD-BOT-READY-7.2.0.zip`). Commit the upload. GitHub Actions then extracts the source, runs the JavaScript syntax check, commits the installed source files, and removes the uploaded archive. The follow-up source commit is what should trigger the existing Render auto-deploy configuration.

Do not upload the archive inside a subfolder. Do not rename it to a filename that does not start with `YVONNIE2005-MD-BOT-READY`. Do not delete the existing Render service or database. The workflow preserves `.github`, environment files, database files, auth/session folders, temporary files, and installed dependencies from destructive replacement. Confirm the Actions run succeeds before relying on the Render deployment.

The public connection portal is `/`. The separate owner control centre is `/admin`; it is not advertised from the public portal and requires owner authentication. Runtime logs and environment variables remain in the Render service dashboard.

The ZIP intentionally excludes `.env` files, database files, WhatsApp auth/session data, `.git`, and `node_modules`.
