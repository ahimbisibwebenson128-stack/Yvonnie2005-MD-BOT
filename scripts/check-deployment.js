"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["pairing browser identity", /browser:\s*\[\s*["']Windows["']\s*,\s*["']Chrome["']/.test(read("core/bot.js"))],
  ["pairing request single-flight guard", /this\.pairingRequest && this\.pairingNumber === number/.test(read("core/bot.js"))],
  ["owner number restriction", /ownerNumber && number !== ownerNumber/.test(read("core/bot.js"))],
  ["credential flush before restart", /statusCode === DisconnectReason\.restartRequired[\s\S]{0,350}saveSession/.test(read("core/bot.js"))],
  ["logged-out session preservation", /Saved credentials are being preserved/.test(read("core/bot.js"))],
  ["pairing status endpoint", /pathname === \"\/api\/status\"/.test(read("index.js"))],
  ["server-side owner authentication", /pathname === "\/api\/admin\/verify"/.test(read("index.js")) && /timingSafeEqual/.test(read("index.js"))],
  ["public portal and owner dashboard assets", fs.existsSync(path.join(root, "public/index.html")) && fs.existsSync(path.join(root, "public/admin.html")) && fs.existsSync(path.join(root, "public/mascot.png"))],
  ["owner dashboard verifies key before unlock", /api\/admin\/verify/.test(read("public/admin.html"))],
  ["pairing number validation", /valid international WhatsApp number/.test(read("index.js"))],
  ["YouTube search uses local yt-dlp service", /return await priv\.ytSearch\(query, limit\)/.test(read("plugins/utils/yt.js")) && /async function ytSearch/.test(read("core/services.js"))],
  ["antilink status avoids live group metadata lookup", /const subject = message\.groupName \|\| message\.subject \|\| message\.jid/.test(read("plugins/manage.js"))],
  ["ZIP installer workflow", fs.existsSync(path.join(root, ".github/workflows/install-project-zip.yml"))],
];
let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
