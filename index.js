const path = require("path");
const fs = require("fs");
if (fs.existsSync("./config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

const { suppressLibsignalLogs } = require("./core/helpers");

suppressLibsignalLogs();

const { initializeDatabase } = require("./core/database");
const { BotManager } = require("./core/manager");
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
<body><main class="card"><div class="logo">Y</div><div class="tag">WhatsApp connection portal</div><h1>YVONNIE2005 BOT</h1><p>Link your WhatsApp account securely using a one-time pairing code. Your number must include its country code.</p><label for="number">WhatsApp phone number</label><input id="number" type="tel" inputmode="numeric" placeholder="2567XXXXXXXX" autocomplete="tel"><label for="key">Owner access key</label><input id="key" type="password" placeholder="Enter the pairing access key" autocomplete="off"><button id="go">Generate pairing code</button><div class="code" id="codebox"><div class="tag">Your one-time code</div><strong id="code"></strong><button id="copy" type="button">Copy code</button></div><div class="status" id="status" role="status"></div><div class="hint">On WhatsApp: Settings → Linked devices → Link a device → Link with phone number instead. Never share your code.</div></main><script>const $=id=>document.getElementById(id);$('go').onclick=async()=>{const number=$('number').value.replace(/\D/g,'');const key=$('key').value.trim();$('status').textContent='Requesting a code…';$('codebox').style.display='none';$('go').disabled=true;try{const r=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({number})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not generate code');$('code').textContent=d.code;$('codebox').style.display='block';$('status').textContent='Code generated. Enter it in WhatsApp now.'}catch(e){$('status').textContent=e.message}finally{$('go').disabled=false}};$('copy').onclick=async()=>{await navigator.clipboard.writeText($('code').textContent);$('status').textContent='Pairing code copied.'};</script></body></html>`;

    const sendJson = (res, status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const server = http.createServer(async (req, res) => {
      const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", name: "YVONNIE2005 BOT", connected: botManager.connectedBots().length > 0 }));
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
            const sessionId = SESSION[0];
            const bot = botManager.getBot(sessionId);
            if (!bot) return sendJson(res, 503, { error: "Bot session is not initialized. Check the service logs and SESSION setting." });
            const code = await bot.requestPairingCode(body.number);
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
