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
  ["owner-authenticated QR endpoint", /pathname === "\/api\/admin\/qr"/.test(read("index.js")) && /ownerAuthorized\(req\)/.test(read("index.js"))],
  ["persistent owner settings API", /pathname === "\/api\/admin\/settings"/.test(read("index.js")) && /BotVariable\.upsert/.test(read("index.js"))],
  ["registered command catalogue API", /pathname === "\/api\/admin\/commands"/.test(read("index.js"))],
  ["authenticated live AI test endpoint", /pathname === "\/api\/admin\/ai-test"/.test(read("index.js")) && /GEMINI_API_KEY/.test(read("index.js"))],
  ["owner dashboard exposes live AI test action", /id="testAI"/.test(read("public/admin.html")) && /api\/admin\/ai-test/.test(read("public/admin.html"))],
  ["portal displays both pairing methods", /Generate pairing code/.test(read("public/index.html")) && /Display QR code/.test(read("public/index.html"))],
  ["scrollable portal FAQs", /\.faq\{[^}]*overflow-y:auto/.test(read("public/index.html"))],
  ["premium multi-tab owner dashboard", /data-tab="automation"/.test(read("public/admin.html")) && /data-tab="safety"/.test(read("public/admin.html")) && /data-tab="commands"/.test(read("public/admin.html"))],
  ["AI fallback for image inputs and transient failures", /gemini-3\.5-flash-lite/.test(read("plugins/chatbot.js")) && /Boolean\(imageBuffer\)/.test(read("plugins/chatbot.js"))],
  ["AI uses current Gemini 3.8 Flash model", /const MODEL = "gemini-3\.8-flash"/.test(read("plugins/chatbot.js"))],
  ["owner dashboard exposes a live AI test", /api\/admin\/ai-test/.test(read("public/admin.html")) && /pathname === "\/api\/admin\/ai-test"/.test(read("index.js"))],
  ["AI group toggles and system prompt are editable", /CHATBOT_ALL_GROUPS/.test(read("index.js")) && /CHATBOT_SYSTEM_PROMPT/.test(read("index.js")) && /settings-ai/.test(read("public/admin.html"))],
  ["owner bypasses fragile group metadata check in antilink command", /message\.fromOwner\s*\?\s*true/.test(read("plugins/manage.js"))],
  ["single live AI test route with fallback model", (read("index.js").match(/pathname === "\/api\/admin\/ai-test"/g) || []).length === 1 && /gemini-3\.5-flash-lite/.test(read("index.js"))],
  ["AI group toggles handle boolean and string database values", /function isEnabledValue/.test(read("plugins/chatbot.js")) && /CHATBOT_ALL_GROUPS/.test(read("config.js"))],
  ["AI prompt and global chat settings editable in owner centre", /settings-ai/.test(read("public/admin.html")) && /CHATBOT_SYSTEM_PROMPT/.test(read("index.js"))],
];
let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
