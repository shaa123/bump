require("dotenv").config();
const { Client } = require("discord.js-selfbot-v13");
const fs = require("fs");
const https = require("https");
const { startDashboard } = require("./dashboard");

// ── Config ──────────────────────────────────────────────
const DEFAULT_CONFIG = {
  channels: [],
  bumpIntervalMinutes: 120,
  jitterMinMinutes: 1,
  jitterMaxMinutes: 5,
  typingDelayMs: [1000, 3000],
  sleepHours: { enabled: false, start: 1, end: 7 },
  logRotation: { maxSizeMB: 5 },
  webhook: { enabled: false, url: "" },
  maxConsecutiveFailures: 3,
  dashboard: { enabled: true, port: 3000 },
};

let config;
try {
  const raw = fs.readFileSync("config.json", "utf8");
  const user = JSON.parse(raw);
  config = {
    ...DEFAULT_CONFIG,
    ...user,
    sleepHours: { ...DEFAULT_CONFIG.sleepHours, ...(user.sleepHours || {}) },
    logRotation: { ...DEFAULT_CONFIG.logRotation, ...(user.logRotation || {}) },
    webhook: { ...DEFAULT_CONFIG.webhook, ...(user.webhook || {}) },
    dashboard: { ...DEFAULT_CONFIG.dashboard, ...(user.dashboard || {}) },
    typingDelayMs: Array.isArray(user.typingDelayMs) && user.typingDelayMs.length === 2
      ? user.typingDelayMs
      : DEFAULT_CONFIG.typingDelayMs,
  };
} catch {
  config = { ...DEFAULT_CONFIG };
}

// Ensure jitterMin <= jitterMax
if (config.jitterMinMinutes > config.jitterMaxMinutes) {
  const tmp = config.jitterMinMinutes;
  config.jitterMinMinutes = config.jitterMaxMinutes;
  config.jitterMaxMinutes = tmp;
}

const client = new Client();
const TOKEN = process.env.TOKEN;
const DISBOARD_ID = "302050872383242240";
let shuttingDown = false;

// ── Dashboard state ─────────────────────────────────────
const state = {
  bot: { online: false, tag: "", startedAt: null },
  channels: {},
  nextBumpAt: null,
  log: [],
  stats: { total: 0, success: 0, fail: 0 },
};

const MAX_LOG_ENTRIES = 100;

// ── Validation ──────────────────────────────────────────
if (!TOKEN || TOKEN === "paste_your_token_here") {
  console.error("[ERROR] TOKEN is not set. Edit your .env file with a valid Discord token.");
  process.exit(1);
}

// Backwards compat: fall back to CHANNEL_ID from .env if config has no channels
if (!Array.isArray(config.channels) || config.channels.length === 0) {
  const envChannel = process.env.CHANNEL_ID;
  if (!envChannel || envChannel === "paste_your_channel_id_here") {
    console.error(
      "[ERROR] No channels configured. Add channels to config.json or set CHANNEL_ID in .env"
    );
    process.exit(1);
  }
  config.channels = [envChannel];
}

// ── Logging with rotation ───────────────────────────────
function log(msg) {
  const time = new Date().toLocaleString();
  const line = `[${time}] ${msg}`;
  console.log(line);

  // Push to dashboard state
  state.log.push(line);
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.shift();
  }

  try {
    const logFile = "bump_log.txt";
    const oldFile = "bump_log.old.txt";
    const maxBytes = config.logRotation.maxSizeMB * 1024 * 1024;

    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size >= maxBytes) {
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
        fs.renameSync(logFile, oldFile);
      }
    }
    fs.appendFileSync(logFile, line + "\n");
  } catch (err) {
    console.error(`Log write error: ${err.message}`);
  }
}

// ── Webhook alerts ──────────────────────────────────────
function sendWebhook(message) {
  if (!config.webhook.enabled || !config.webhook.url) return;

  try {
    const url = new URL(config.webhook.url);
    const payload = JSON.stringify({
      content: message,
      username: "AutoBump Alert",
    });

    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    });
    req.on("error", () => {}); // silently ignore webhook errors
    req.write(payload);
    req.end();
  } catch {
    // silently ignore
  }
}

// ── Sleep hours ─────────────────────────────────────────
function isDuringSleepHours() {
  if (!config.sleepHours.enabled) return false;
  const hour = new Date().getHours();
  const { start, end } = config.sleepHours;
  if (start <= end) {
    return hour >= start && hour < end;
  }
  // Wraps past midnight (e.g. start:23, end:7 = sleep 11pm-7am)
  return hour >= start || hour < end;
}

// ── Disboard response listener ──────────────────────────
function waitForDisboardResponse(channel, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.off("messageCreate", handler);
      resolve(null);
    }, timeoutMs);

    const handler = (msg) => {
      const isDisboard =
        msg.author?.id === DISBOARD_ID || msg.applicationId === DISBOARD_ID;
      if (msg.channel.id === channel.id && isDisboard) {
        clearTimeout(timer);
        client.off("messageCreate", handler);
        resolve(msg);
      }
    };

    client.on("messageCreate", handler);
  });
}

// ── Bump a single channel ───────────────────────────────
async function bumpChannel(channelId) {
  // Init channel state if needed
  if (!state.channels[channelId]) {
    state.channels[channelId] = {
      lastBumpAt: null,
      lastResult: null,
      consecutiveFailures: 0,
    };
  }

  try {
    const channel = await client.channels.fetch(channelId);

    // Typing delay to look human
    const [minDelay, maxDelay] = config.typingDelayMs;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
    await new Promise((r) => setTimeout(r, delay));

    await channel.sendSlash(DISBOARD_ID, "bump");
    log(`[${channelId}] Bump command sent, awaiting response...`);

    // Wait up to 15s for Disboard to respond
    const response = await waitForDisboardResponse(channel, 15000);

    if (!response) {
      log(`[${channelId}] ⚠️ No response from Disboard within 15s`);
      state.channels[channelId].lastBumpAt = Date.now();
      state.channels[channelId].lastResult = "fail";
      return { success: false, retryAfterMs: null };
    }

    // Parse response (embeds + content)
    const content = (response.content || "").toLowerCase();
    const embedDesc = (response.embeds?.[0]?.description || "").toLowerCase();
    const text = content + " " + embedDesc;

    if (text.includes("bump done")) {
      log(`[${channelId}] ✅ Bump confirmed by Disboard!`);
      state.channels[channelId].lastBumpAt = Date.now();
      state.channels[channelId].lastResult = "success";
      return { success: true, retryAfterMs: null };
    }

    const cooldownMatch = text.match(/(\d+)\s*minute/);
    if (cooldownMatch) {
      const waitMin = parseInt(cooldownMatch[1], 10);
      log(`[${channelId}] ⏳ Cooldown: ${waitMin} minutes remaining`);
      state.channels[channelId].lastBumpAt = Date.now();
      state.channels[channelId].lastResult = "cooldown";
      // Retry 1 minute after cooldown expires
      return { success: false, retryAfterMs: (waitMin + 1) * 60 * 1000 };
    }

    log(`[${channelId}] ⚠️ Unknown Disboard response`);
    state.channels[channelId].lastBumpAt = Date.now();
    state.channels[channelId].lastResult = "fail";
    return { success: false, retryAfterMs: null };
  } catch (err) {
    log(`[${channelId}] ❌ Bump failed: ${err.message}`);
    state.channels[channelId].lastBumpAt = Date.now();
    state.channels[channelId].lastResult = "fail";
    return { success: false, retryAfterMs: null };
  }
}

// ── Bump all channels ───────────────────────────────────
async function bumpAll() {
  if (isDuringSleepHours()) {
    log("😴 Sleep hours active, skipping this bump cycle");
    return;
  }

  for (let i = 0; i < config.channels.length; i++) {
    const channelId = config.channels[i];
    const result = await bumpChannel(channelId);

    state.stats.total++;
    if (result.success) {
      state.stats.success++;
      state.channels[channelId].consecutiveFailures = 0;
    } else {
      state.stats.fail++;
      state.channels[channelId].consecutiveFailures++;

      // Auto-retry on cooldown
      if (result.retryAfterMs) {
        const retryMin = Math.floor(result.retryAfterMs / 60000);
        log(`[${channelId}] 🔄 Auto-retry in ${retryMin} minutes`);
        setTimeout(async () => {
          try {
            await bumpChannel(channelId);
          } catch (err) {
            log(`[${channelId}] ❌ Retry failed: ${err.message}`);
          }
        }, result.retryAfterMs);
      }

      // Alert on repeated failures
      if (state.channels[channelId].consecutiveFailures >= config.maxConsecutiveFailures) {
        const msg = `⚠️ Channel ${channelId}: ${state.channels[channelId].consecutiveFailures} consecutive failures`;
        log(msg);
        sendWebhook(msg);
      }
    }

    // 3s delay between channels to avoid rate limits
    if (i < config.channels.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ── Scheduling ──────────────────────────────────────────
function getJitterMs() {
  const minMs = config.jitterMinMinutes * 60 * 1000;
  const maxMs = config.jitterMaxMinutes * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

function scheduleNext() {
  const wait = config.bumpIntervalMinutes * 60 * 1000 + getJitterMs();
  const minutes = Math.floor(wait / 60000);
  state.nextBumpAt = Date.now() + wait;
  log(`⏰ Next bump in ${minutes} minutes...`);

  setTimeout(async () => {
    try {
      await bumpAll();
    } catch (err) {
      log(`❌ Unexpected error during bump cycle: ${err.message}`);
    }
    scheduleNext();
  }, wait);
}

// ── Client events ───────────────────────────────────────
client.on("ready", async () => {
  state.bot.online = true;
  state.bot.tag = client.user.tag;
  state.bot.startedAt = Date.now();

  log(`🟢 Logged in as ${client.user.tag}`);
  log(`📍 Channels: ${config.channels.join(", ")}`);
  log(
    `⏱️  Interval: ${config.bumpIntervalMinutes}min + ${config.jitterMinMinutes}-${config.jitterMaxMinutes}min jitter`
  );
  if (config.sleepHours.enabled) {
    log(`😴 Sleep hours: ${config.sleepHours.start}:00 - ${config.sleepHours.end}:00`);
  }

  // Start dashboard
  if (config.dashboard.enabled) {
    startDashboard(state, config, config.dashboard.port);
    log(`🌸 Dashboard running at http://localhost:${config.dashboard.port}`);
  }

  await bumpAll();
  scheduleNext();
});

client.on("error", (err) => {
  log(`❌ Client error: ${err.message}`);
});

// ── Error handling & graceful shutdown ───────────────────
process.on("unhandledRejection", (err) => {
  log(`❌ Unhandled rejection: ${err && err.message ? err.message : err}`);
});

process.on("uncaughtException", (err) => {
  log(`💥 Crash: ${err.message}`);
  log("Exiting in 5 seconds (restart handled by start.bat)...");
  setTimeout(() => process.exit(1), 5000);
});

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  state.bot.online = false;
  log(`${signal} received, shutting down...`);
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

client.login(TOKEN).catch((err) => {
  log(`❌ Login failed: ${err.message}`);
  process.exit(1);
});
