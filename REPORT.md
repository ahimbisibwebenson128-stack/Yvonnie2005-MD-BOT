# YVONNIE2005 clean build: audit report

## 1. What was sending data to / taking orders from the authors (all removed)
| Item | What it did | Status |
|---|---|---|
| `core/private.js` (81 KB obfuscated) | Client for 8 author-run servers (rgnk.site hosts, onrender, vercel, koyeb) with hardcoded API tokens | Removed, replaced by readable `core/services.js` |
| Session backend (`fetchInitialSession`) | Your WhatsApp login session was fetched from / held on their server | Removed; local login (QR / pairing code) |
| Announcement feed (`createAnnouncementFeed`) | Live connection to events.rgnk.site; reported bot version and session count; could push messages to your owner chat | Removed |
| Auto-update (forced ON) | Every 2 min `git reset --hard && git pull` from author's GitHub, then restart: remote code execution on every instance | Removed, `AUTO_UPDATE` fixed false, `plugins/updater.js`, `simple-git`, `eventsource` deleted |
| Remote plugin installer (round 2) | `.install <url>` downloaded and ran arbitrary code; saved URLs were re-downloaded and executed on every boot | Removed (`external-plugin.js`, `sql/plugin.js`, boot loop) |
| Server-side downloaders | IG/FB/TikTok/Pinterest/Spotify/YouTube, lyrics, music-id, attp, webp->mp4 ran on their servers (they saw every link you sent) | Replaced with local yt-dlp / ffmpeg / Jimp |
| Hardcoded group JIDs (`RG`, `ANTI_SPAM`) | Bot auto-joined/acted in author-chosen groups | Removed |
| Dockerfile `git clone` of upstream | Pulled author's latest code at build | Now copies your local folder |
| Dead update code (round 2) | Leftover version-compare / timers | Removed |

## 2. Verified clean
- No author-owned host remains in any `.js/.json` file (`npm run audit:hosts` passes).
- All 564 lockfile packages resolve to registry.npmjs.org only; no git/file dependencies.
- No obfuscated code, `new Function`, `vm`, or dynamic remote `require`. No environment, hostname or user-info collection. No hardcoded phone numbers.
- Every `.js` file passes `node --check`.

## 3. Still connects out, only when YOU use the feature (third-party, not the authors)
Instagram, Pinterest and lrclib.net (the re-added features), Google Translate, Google image search, Google input tools (manglish), Gemini chatbot (your key), ttsmp3 (text-to-speech), catbox.moe and imgbb (uploads), Render API (your key), optional ACRCloud (your keys), and WhatsApp itself. Also Baileys checks the latest WhatsApp Web version on GitHub (set `WA_VERSION` to stop it). yt-dlp contacts the video sites you link. These are closed third-party services; if you want zero of them, delete the matching plugin file.

## 4. Kept on purpose
- Owner-only `>` eval (your own account/SUDO only).
- KickBot: pings only YOUR OWN host URL on Render/Koyeb/Railway.

## 5. Re-added (round 3)
Instagram profile, Instagram stories (needs your cookies file), Pinterest search, lyrics, plus yt-dlp retry/timeout hardening. All open or local; none use the authors' servers.

## 5b. Rebrand
Name/owner: YVONNIE2005. Default SUDO/owner: 256746244963. Author's GitHub/Telegram links removed. NOTICE.md and LICENSE keep the GPL-3.0 attribution to the original author.

## 5c. WhatsApp pairing reliability
- Pairing uses the standard `Chrome (Windows)` companion platform display. The former product-name browser identity could be rejected by WhatsApp even though Baileys returned a code.
- Pair-code requests are single-flight: repeated requests reuse the same in-flight result instead of overwriting Baileys pairing credentials.
- Credentials are flushed before the expected 515 restart reconnect. A logged-out session is preserved for owner review rather than automatically deleted.

## 6. Owner portal and dashboard
- Replaced the basic connection page with a responsive emerald/black/gold glassmorphism portal using the supplied Emerald Crown Spider mascot.
- Added a separate `/admin` owner control centre with server-side `PAIRING_API_KEY` verification, live connection status, readiness, refresh, lock/logout, and links to the actual Render dashboard.
- Added `/mascot.png` local asset serving and international phone-number validation before pairing.
- The dashboard intentionally does not show fake controls, simulated logs, or pretend command buttons.

## 6b. Owner dashboard and pairing portal upgrade
- The connection portal presents both pairing-code and QR workflows, plus a vertically scrollable FAQ section. QR payloads are returned only from an owner-authenticated endpoint and expire after 20 seconds. The browser draws the QR using a CDN-hosted QR renderer.
- The owner dashboard has glassmorphism styling, gold lighting, a responsive sidebar, overview cards, editable supported configuration groups, AI readiness, a live command catalogue, owner security notes, and a scrollable FAQ.
- Dashboard setting writes are restricted to an explicit allowlist and persisted in `BotVariable`; secret keys are never returned in settings responses. Some startup-loaded settings require restart. An authenticated live AI test endpoint sends a small test prompt and returns the responding model without exposing the API key.
- AI keeps Gemma 4 31B as the text model, normalizes uploaded images to JPEG, uses Gemini 3.5 Flash-Lite for image requests, and retries transient errors before falling back. Google documents Gemini 3.5 Flash-Lite as supporting text and image inputs.

## 7. Not done / caveats
- Not run against a real WhatsApp login or with yt-dlp installed in this build environment. JavaScript syntax and static deployment checks pass, but live WhatsApp command execution, actual QR scanning, pairing-code acceptance, AI provider responses, and YouTube downloads/search still require a deployed service, valid WhatsApp session, valid private API key, quota and working network access. No one can honestly certify every command without testing those external dependencies.
- Postgres connections use `rejectUnauthorized:false` (original behaviour, weakens TLS verification). SQLite default is unaffected.
- QR display requires the browser to load the QRCode.js renderer from cdnjs; pairing-code mode does not depend on that renderer.
- Branding left alone: name, "Sourav K" credit, sticker-pack links to github.com/souravkl11, t.me/raganork_in. GPL-3.0 requires keeping the license and copyright notices.
