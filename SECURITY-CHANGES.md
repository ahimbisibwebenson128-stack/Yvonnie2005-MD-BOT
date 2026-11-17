# Security and connection changes

- The WhatsApp socket runs only on the persistent Render service; Vercel proxies the portal and does not run a WhatsApp session.
- The public pairing endpoint requires the private `PAIRING_API_KEY` as a Bearer token. The key is configured in Render only and is not part of this source archive.
- Pairing is restricted to the owner number configured in `SUDO`.
- Only one pairing request can be active per session. Repeated calls do not replace the active Baileys pairing code.
- The Baileys browser identity is set to the standard `Windows` / `Chrome` values so WhatsApp receives the expected companion platform display. The user-facing portal remains branded YVONNIE2005.
- Session credentials are stored in the configured database. The ZIP installer excludes database files, `.env` files, auth folders, `node_modules`, and temporary files.
- The installer workflow preserves private runtime files while replacing source files and validates JavaScript syntax before committing.
- On the expected `restartRequired` (515) event, pending credentials are flushed before reconnecting. Logged-out credentials are preserved for owner review rather than automatically erased.

This project uses an unofficial WhatsApp Web client library. WhatsApp can change its protocol or limit pairing attempts; a successful code display is not proof that WhatsApp accepted the link. Test the real connection in the Render logs.
