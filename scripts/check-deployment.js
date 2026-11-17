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
  ["ZIP installer workflow", fs.existsSync(path.join(root, ".github/workflows/install-project-zip.yml"))],
];
let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
