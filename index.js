const path = require("path");
const fs = require("fs");
if (fs.existsSync("./config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

const { suppressLibsignalLogs } = require("./core/helpers");

suppressLibsignalLogs();

const { initializeDatabase } = require("./core/database");
const { BotManager } = require("./core/manager");
const { BotVariable } = require("./core/database");
const config = require("./config");
const { SESSION, logger } = config;
const http = require("http");
const crypto = require("crypto");
const {
  ensureTempDir,
  TEMP_DIR,
  initializeKickBot,
  cleanupKickBot,
  startTempSweeper,
} = require("./core/helpers");

async function main() {
  ensureTempDir();
  startTempSweeper();
  logger.info(`Created temporary directory at ${TEMP_DIR}`);
  console.log(`YVONNIE2005 BOT v${require("./package.json").version}`);
  console.log(`- Configured sessions: ${SESSION.join(", ")}`);
  logger.info(`Configured sessions: ${SESSION.join(", ")}`);
  if (SESSION.length === 0) {
    const warnMsg =
      "⚠️ No sessions configured. Please set SESSION environment variable.";
    console.warn(warnMsg);
    logger.warn(warnMsg);
    return;
  }

  try {
    await initializeDatabase();
    console.log("- Database initialized");
    logger.info("Database initialized successfully.");
  } catch (dbError) {
    console.error(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    logger.fatal(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    process.exit(1);
  }

  const botManager = new BotManager();

  const shutdownHandler = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    logger.info(`Received ${signal}, shutting down...`);
    cleanupKickBot();
    await botManager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  await botManager.initializeBots();
  console.log("- Bot initialization complete.");
  logger.info("Bot initialization complete");

  initializeKickBot();

  const startServer = () => {
    const PORT = process.env.PORT || 3000;

    const portal = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#071b14"><title>YVONNIE2005 BOT | Connect</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 20% 0%,#164b35 0,transparent 45%),linear-gradient(135deg,#06110d,#0b2118 55%,#08130f);color:#f4fff8;font:16px system-ui,sans-serif;display:grid;place-items:center;padding:22px}.card{width:min(100%,480px);padding:30px;border:1px solid #b9e7c633;border-radius:24px;background:#0c2119dd;box-shadow:0 24px 80px #0008;backdrop-filter:blur(18px)}.logo{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#d9b65c,#8b6b23);color:#10180f;font-weight:900;font-size:22px}h1{margin:18px 0 6px;font-size:27px;letter-spacing:.04em}p{color:#b5cdbd;line-height:1.55}.tag{color:#d9bd6b;font-size:12px;letter-spacing:.18em;text-transform:uppercase}label{display:block;margin:18px 0 8px;color:#d9e9de;font-size:13px}input{width:100%;padding:15px;border-radius:12px;border:1px solid #507563;background:#07150f;color:white;font-size:16px;outline:none}input:focus{border-color:#d9bd6b}button{width:100%;margin-top:14px;padding:15px;border:0;border-radius:12px;background:linear-gradient(100deg,#e2c46f,#b18b36);color:#10170e;font-weight:800;font-size:15px}button:disabled{opacity:.6}.code{display:none;margin-top:18px;padding:20px;border:1px dashed #d9bd6b;border-radius:14px;text-align:center}.code strong{display:block;font-size:30px;letter-spacing:.16em;color:#f2d783}.status{min-height:24px;margin-top:14px;font-size:13px;color:#c5d9cc}.hint{font-size:12px;color:#8da998;margin-top:20px}</style></head>
<body><main class="card"><div class="logo">Y</div><div class="tag">Secure WhatsApp connection portal</div><h1>YVONNIE2005 BOT</h1><p>Connect the owner WhatsApp account using one pairing code. Enter the full number with country code, without a plus sign.</p><label for="number">WhatsApp phone number</label><input id="number" type="tel" inputmode="numeric" placeholder="2567XXXXXXXX" autocomplete="tel"><label for="key">Owner access key</label><input id="key" type="password" placeholder="Enter the pairing access key" autocomplete="off"><button id="go">Generate pairing code</button><div class="code" id="codebox"><div class="tag">Your one-time code</div><strong id="code"></strong><button id="copy" type="button">Copy code</button></div><div class="status" id="status" role="status">Checking bot readiness…</div><div class="hint">WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead. Enter the code immediately. Never request multiple codes or share the code.</div></main><script>const $=id=>document.getElementById(id);let codeIssued=false;async function checkStatus(){try{const r=await fetch('/api/status',{cache:'no-store'});const d=await r.json();if(d.state==='connected')$('status').textContent='YVONNIE2005 BOT is already connected.';else if(d.ready)$('status').textContent='Bot is ready. Generate one pairing code.';else if(d.state==='logged_out')$('status').textContent='Saved session needs owner review. Do not keep requesting codes.';else $('status').textContent='Bot is starting. Wait a little, then refresh this page.'}catch(e){$('status').textContent='Could not check bot status. Refresh in a moment.'}}checkStatus();$('go').onclick=async()=>{if(codeIssued)return;const number=$('number').value.replace(/\D/g,'');const key=$('key').value.trim();if(!number||!key){$('status').textContent='Enter the WhatsApp number and owner access key.';return;}$('status').textContent='Requesting your one-time code…';$('codebox').style.display='none';$('go').disabled=true;try{const r=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({number})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not generate code');$('code').textContent=d.code;$('codebox').style.display='block';$('status').textContent='Code ready. Enter it in WhatsApp now. Do not generate another.';codeIssued=true;$('go').textContent='Code already generated';}catch(e){$('status').textContent=e.message;$('go').disabled=false}};$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').textContent);$('status').textContent='Pairing code copied. Enter it in WhatsApp now.'}catch(e){$('status').textContent='Select and copy the code manually.'}};</script></body></html>`;

    const sendJson = (res, status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const ownerAuthorized = (req) => {
      const expected = process.env.PAIRING_API_KEY || "";
      const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const a = Buffer.from(supplied);
      const b = Buffer.from(expected);
      return Boolean(expected && supplied && a.length === b.length && crypto.timingSafeEqual(a, b));
    };
    const settingGroups = {
      bot: ["BOT_NAME", "BOT_INFO", "HANDLERS", "MODE", "ALIVE", "LANGUAGE", "STICKER_DATA", "SUPPORT_GROUP", "MULTI_HANDLERS"],
      automation: ["READ_MESSAGES", "READ_COMMAND", "AUTO_READ_STATUS", "ALWAYS_ONLINE", "DISABLE_START_MESSAGE", "CMD_REACTION", "MANGLISH_CHATBOT", "PMB_VAR", "AUTOMUTE_MSG", "AUTOUNMUTE_MSG"],
      safety: ["PM_ANTISPAM", "ADMIN_ACCESS", "REJECT_CALLS", "DIS_PM", "BLOCK_CHAT", "WARN", "ANTILINK_WARN", "ANTISPAM_COUNT", "ALLOWED_CALLS", "CALL_REJECT_MESSAGE", "ANTIWORD_WARN", "PMB"],
      ai: ["CHATBOT_ALL_GROUPS", "CHATBOT_ALL_DMS", "CHATBOT_SYSTEM_PROMPT"],
    };
    const allowedSettings = new Set(Object.values(settingGroups).flat());
    const booleanSettings = new Set(["READ_MESSAGES", "READ_COMMAND", "AUTO_READ_STATUS", "ALWAYS_ONLINE", "DISABLE_START_MESSAGE", "CMD_REACTION", "PM_ANTISPAM", "ADMIN_ACCESS", "REJECT_CALLS", "DIS_PM", "MANGLISH_CHATBOT", "PMB_VAR", "MULTI_HANDLERS", "CHATBOT_ALL_GROUPS", "CHATBOT_ALL_DMS"]);
    const settingLabels = {
      BOT_NAME: "Bot display name", BOT_INFO: "Bot status information", HANDLERS: "Command prefixes", MODE: "Bot mode", ALIVE: "Alive response", LANGUAGE: "Bot language", STICKER_DATA: "Sticker pack name", SUPPORT_GROUP: "Support group link",
      MULTI_HANDLERS: "Accept commands with or without prefix", READ_MESSAGES: "Auto-read messages", READ_COMMAND: "Auto-read commands", AUTO_READ_STATUS: "Auto-read status updates", ALWAYS_ONLINE: "Always appear online", DISABLE_START_MESSAGE: "Disable startup message", CMD_REACTION: "React to commands", MANGLISH_CHATBOT: "Manglish translation assistant", PMB_VAR: "Private-message auto blocker", AUTOMUTE_MSG: "Auto-mute message", AUTOUNMUTE_MSG: "Auto-unmute message",
      CHATBOT_ALL_GROUPS: "Enable AI in all groups", CHATBOT_ALL_DMS: "Enable AI in all private chats", CHATBOT_SYSTEM_PROMPT: "AI assistant system instructions",
      PM_ANTISPAM: "Private-message anti-spam", ADMIN_ACCESS: "Allow group-admin commands", REJECT_CALLS: "Reject incoming calls", DIS_PM: "Disable private chats", BLOCK_CHAT: "Blocked chat IDs", WARN: "Warning limit", ANTILINK_WARN: "Anti-link warning threshold", ANTISPAM_COUNT: "Anti-spam message threshold", ALLOWED_CALLS: "Allowed caller numbers", CALL_REJECT_MESSAGE: "Call rejection message", ANTIWORD_WARN: "Blocked words", PMB: "Private-message blocker response",
    };
    const readBody = (req, max = 8192) => new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", chunk => { raw += chunk; if (raw.length > max) { reject(new Error("Request is too large.")); req.destroy(); } });
      req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (_) { reject(new Error("Invalid JSON request.")); } });
      req.on("error", reject);
    });
    const server = http.createServer(async (req, res) => {
      const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
      // Serve the public pairing portal, owner control centre, and mascot from local files.
      if (req.method === "GET" && (pathname === "/" || pathname === "/admin" || pathname === "/admin/" || pathname === "/mascot.png")) {
        const asset = pathname === "/mascot.png" ? "mascot.png" : pathname.startsWith("/admin") ? "admin.html" : "index.html";
        const file = path.join(__dirname, "public", asset);
        if (!fs.existsSync(file)) return sendJson(res, 503, { error: "Portal asset is missing." });
        res.writeHead(200, { "Content-Type": asset.endsWith(".png") ? "image/png" : "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return res.end(fs.readFileSync(file));
      }
      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const bot = botManager.getBot(SESSION[0]);
        return res.end(JSON.stringify({ status: "ok", name: "YVONNIE2005 BOT", connected: botManager.connectedBots().length > 0, pairing: bot?.getPairingStatus?.() || { state: "starting", ready: false } }));
      }
      if (req.method === "POST" && pathname === "/api/admin/verify") {
        const expected = process.env.PAIRING_API_KEY || "";
        const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const a = Buffer.from(supplied);
        const b = Buffer.from(expected);
        const valid = Boolean(expected && supplied && a.length === b.length && crypto.timingSafeEqual(a, b));
        return sendJson(res, valid ? 200 : 401, valid ? { ok: true } : { error: "Owner key is incorrect or not configured." });
      }
      if (pathname.startsWith("/api/admin/") && pathname !== "/api/admin/verify" && !ownerAuthorized(req)) {
        return sendJson(res, 401, { error: "Owner authentication required." });
      }
      if (req.method === "GET" && pathname === "/api/admin/settings") {
        const values = {};
        for (const key of allowedSettings) values[key] = config[key] ?? "";
        return sendJson(res, 200, {
          values,
          groups: Object.fromEntries(Object.entries(settingGroups).map(([group, keys]) => [group, keys.map(key => ({ key, label: settingLabels[key], type: booleanSettings.has(key) ? "boolean" : "text", value: values[key] }))])),
          ai: { provider: "Google Gemini", model: "gemini-3.8-flash", fallbackModel: "gemini-3.5-flash-lite", configured: Boolean(config.GEMINI_API_KEY), control: "AI settings are saved to the bot database; API keys remain private." },
          identity: { name: config.BOT_NAME || "YVONNIE2005", version: require("./package.json").version, ownerConfigured: Boolean(process.env.SUDO) },
        });
      }
      if (req.method === "POST" && pathname === "/api/admin/settings") {
        try {
          const body = await readBody(req);
          const key = String(body.key || "");
          if (!allowedSettings.has(key)) return sendJson(res, 400, { error: "This setting is not editable from the dashboard." });
          let value = body.value;
          if (booleanSettings.has(key)) value = value === true || value === "true" || value === 1;
          else {
            value = String(value ?? "").trim();
            if (value.length > 2000) return sendJson(res, 400, { error: "Setting value is too long." });
            if (key === "MODE" && !["private", "public"].includes(value)) return sendJson(res, 400, { error: "Mode must be private or public." });
            if (key === "HANDLERS" && (!value || value.length > 8)) return sendJson(res, 400, { error: "Use one or more short command prefix characters." });
            if (["WARN", "ANTILINK_WARN"].includes(key) && value && (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 20)) return sendJson(res, 400, { error: "Enter a number from 1 to 20." });
          }
          await BotVariable.upsert({ key, value: String(value) });
          config[key] = value;
          return sendJson(res, 200, { ok: true, key, value, note: ["HANDLERS", "MODE"].includes(key) ? "Saved. Some command routing changes may require a service restart." : "Saved to the bot database." });
        } catch (error) { return sendJson(res, 400, { error: error.message }); }
      }
      if (req.method === "POST" && pathname === "/api/admin/ai-test") {
        const apiKey = config.GEMINI_API_KEY;
        if (!apiKey) return sendJson(res, 400, { error: "GEMINI_API_KEY is not configured. Add it to the private Render environment or use the owner .setvar command." });
        const prompt = { contents: [{ role: "user", parts: [{ text: "Reply with exactly: YVONNIE2005 AI connection test successful." }] }], generationConfig: { maxOutputTokens: 40, temperature: 0 } };
        const testModel = async (model) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify(prompt),
              signal: controller.signal,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              const error = new Error(data?.error?.message || `Google AI returned HTTP ${response.status}`);
              error.status = response.status;
              throw error;
            }
            const answer = (data?.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("").trim();
            if (!answer) throw new Error("Google AI returned no text. Check model access and API quota.");
            return { model, answer };
          } finally { clearTimeout(timeout); }
        };
        try {
          let result;
          try { result = await testModel("gemini-3.8-flash"); }
          catch (primaryError) {
            const transient = [408, 429, 500, 502, 503, 504].includes(primaryError.status) || primaryError.name === "AbortError" || !primaryError.status;
            if (!transient) throw primaryError;
            result = await testModel("gemini-3.5-flash-lite");
          }
          return sendJson(res, 200, { ok: true, model: result.model, answer: result.answer.slice(0, 180) });
        } catch (error) {
          return sendJson(res, 502, { error: error.name === "AbortError" ? "AI test timed out after 20 seconds." : String(error.message || "AI provider request failed.").slice(0, 500) });
        }
      }
      if (req.method === "GET" && pathname === "/api/admin/commands") {
        const commands = require("./main").commands || [];
        const rows = commands.filter(c => c && c.pattern).map(c => ({ command: String(c.pattern.source || "").replace(/^\^/, "").slice(0, 70), description: c.desc || "No description provided", usage: c.usage || "", fromMe: Boolean(c.fromMe) }));
        return sendJson(res, 200, { count: rows.length, commands: rows });
      }
      if (req.method === "GET" && pathname === "/api/admin/qr") {
        const bot = botManager.getBot(SESSION[0]);
        if (!bot?.latestQr || Date.now() - bot.latestQrAt > 20000) return sendJson(res, 404, { error: "A fresh QR code is not currently available. Wait for the bot to display a new QR." });
        return sendJson(res, 200, { qr: bot.latestQr, generatedAt: bot.latestQrAt, expiresInSeconds: Math.max(0, Math.floor((20000 - (Date.now() - bot.latestQrAt)) / 1000)) });
      }
      if (req.method === "GET" && pathname === "/api/status") {
        const bot = botManager.getBot(SESSION[0]);
        const status = bot?.getPairingStatus?.() || { state: "starting", ready: false, linked: false, pairingInProgress: false };
        return sendJson(res, 200, status);
      }
      if (req.method === "POST" && pathname === "/api/pair") {
        const expected = process.env.PAIRING_API_KEY || "";
        const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const suppliedBuffer = Buffer.from(supplied);
        const expectedBuffer = Buffer.from(expected);
        if (!expected || !supplied || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
          return sendJson(res, 401, { error: "Pairing access is not configured or the owner key is incorrect." });
        }
        let raw = "";
        req.on("data", chunk => { raw += chunk; if (raw.length > 4096) req.destroy(); });
        req.on("end", async () => {
          try {
            const body = JSON.parse(raw || "{}");
            const number = String(body.number || "").replace(/\D/g, "");
            if (!/^\d{10,15}$/.test(number)) return sendJson(res, 400, { error: "Enter a valid international WhatsApp number (10–15 digits, country code included)." });
            const sessionId = SESSION[0];
            const bot = botManager.getBot(sessionId);
            if (!bot) return sendJson(res, 503, { error: "Bot session is not initialized. Check the service logs and SESSION setting." });
            const code = await bot.requestPairingCode(number);
            return sendJson(res, 200, { code, session: sessionId });
          } catch (error) { return sendJson(res, 400, { error: error.message }); }
        });
        return;
      }
      if (req.method === "GET" && pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(portal);
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });

    server.listen(PORT, () => {
      logger.info(`Web server listening on port ${PORT}`);
    });
  };

  if (process.env.USE_SERVER !== "false") startServer();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Fatal error in main execution: ${error.message}`, error);
    logger.fatal({ err: error }, `Fatal error in main execution`);
    process.exit(1);
  });
}
