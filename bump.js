require("dotenv").config();
const { Client } = require("discord.js-selfbot-v13");
const fs = require("fs");

const client = new Client();

const CHANNEL_ID = process.env.CHANNEL_ID;
const TOKEN = process.env.TOKEN;
const DISBOARD_ID = "302050872383242240";

if (!TOKEN || TOKEN === "paste_your_token_here") {
  console.error("[ERROR] TOKEN is not set. Edit your .env file with a valid Discord token.");
  process.exit(1);
}

if (!CHANNEL_ID) {
  console.error("[ERROR] CHANNEL_ID is not set. Edit your .env file with a valid channel ID.");
  process.exit(1);
}

// 2 hours + random 1-5 min jitter so it looks human
const BUMP_INTERVAL = 2 * 60 * 60 * 1000;
const JITTER = () => Math.floor(Math.random() * 4 * 60 * 1000) + 1 * 60 * 1000;

function log(msg) {
  const time = new Date().toLocaleString();
  const line = `[${time}] ${msg}`;
  console.log(line);
  fs.appendFileSync("bump_log.txt", line + "\n");
}

async function bump() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.sendSlash(DISBOARD_ID, "bump");
    log("✅ Bump command sent.");
  } catch (err) {
    log(`❌ Bump failed: ${err.message}`);
  }
}

async function scheduleNext() {
  const wait = BUMP_INTERVAL + JITTER();
  const minutes = Math.floor(wait / 60000);
  log(`⏰ Next bump in ${minutes} minutes...`);

  setTimeout(async () => {
    try {
      await bump();
    } catch (err) {
      log(`❌ Unexpected error during bump: ${err.message}`);
    }
    scheduleNext();
  }, wait);
}

client.on("ready", async () => {
  log(`🟢 Logged in as ${client.user.tag}`);
  log(`📍 Bump channel: ${CHANNEL_ID}`);

  // bump immediately on start, then schedule
  await bump();
  scheduleNext();
});

client.on("error", (err) => {
  log(`❌ Client error: ${err.message}`);
});

process.on("unhandledRejection", (err) => {
  log(`❌ Unhandled rejection: ${err.message}`);
});

process.on("uncaughtException", (err) => {
  log(`💥 Crash: ${err.message}`);
  log("Exiting in 5 seconds (restart handled by start.bat)...");
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

client.login(TOKEN).catch((err) => {
  log(`❌ Login failed: ${err.message}`);
  process.exit(1);
});
