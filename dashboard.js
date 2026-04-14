const http = require("http");

function startDashboard(state, config, port) {
  const server = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getHTML());
    } else if (req.url === "/api/state") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(state));
    } else if (req.url === "/api/config") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      // Send config without sensitive data
      const safeConfig = { ...config };
      if (safeConfig.webhook) {
        safeConfig.webhook = { ...safeConfig.webhook, url: safeConfig.webhook.url ? "***" : "" };
      }
      res.end(JSON.stringify(safeConfig));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {});
  return server;
}

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AutoBump Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%);
    min-height: 100vh;
    color: #831843;
  }

  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 16px;
  }

  /* ── Header ─────────────────────────── */
  .header {
    text-align: center;
    margin-bottom: 28px;
  }

  .header h1 {
    font-size: 28px;
    font-weight: 700;
    color: #be185d;
    margin-bottom: 6px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: white;
    padding: 6px 18px;
    border-radius: 50px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 12px rgba(236, 72, 153, 0.15);
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d1d5db;
  }

  .status-dot.online {
    background: #10b981;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
  }

  /* ── Cards ──────────────────────────── */
  .card {
    background: white;
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 2px 16px rgba(236, 72, 153, 0.1);
    border: 1px solid #fce7f3;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #db2777;
    margin-bottom: 14px;
  }

  /* ── Stats Grid ─────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-card {
    background: white;
    border-radius: 16px;
    padding: 18px 14px;
    text-align: center;
    box-shadow: 0 2px 16px rgba(236, 72, 153, 0.1);
    border: 1px solid #fce7f3;
  }

  .stat-icon {
    font-size: 22px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 26px;
    font-weight: 700;
    color: #be185d;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #9d174d;
    margin-top: 4px;
  }

  /* ── Channels ───────────────────────── */
  .channel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: #fdf2f8;
    border-radius: 10px;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .channel-row:last-child { margin-bottom: 0; }

  .channel-id {
    font-weight: 600;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
  }

  .channel-status {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: #9d174d;
  }

  .badge {
    padding: 3px 10px;
    border-radius: 50px;
    font-size: 11px;
    font-weight: 600;
  }

  .badge-success { background: #d1fae5; color: #065f46; }
  .badge-fail { background: #fee2e2; color: #991b1b; }
  .badge-waiting { background: #fef3c7; color: #92400e; }

  /* ── Log ─────────────────────────────── */
  .log-container {
    max-height: 350px;
    overflow-y: auto;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12.5px;
    line-height: 1.7;
    scrollbar-width: thin;
    scrollbar-color: #f9a8d4 transparent;
  }

  .log-container::-webkit-scrollbar { width: 6px; }
  .log-container::-webkit-scrollbar-track { background: transparent; }
  .log-container::-webkit-scrollbar-thumb { background: #f9a8d4; border-radius: 3px; }

  .log-entry {
    padding: 3px 8px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .log-entry:nth-child(even) { background: #fdf2f8; }

  .log-empty {
    text-align: center;
    color: #d1d5db;
    padding: 40px;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
  }

  /* ── Config ─────────────────────────── */
  .config-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: #fdf2f8;
    border-radius: 8px;
    font-size: 13px;
  }

  .config-key { font-weight: 600; }
  .config-val { color: #9d174d; font-family: 'Consolas', monospace; }

  /* ── Footer ─────────────────────────── */
  .footer {
    text-align: center;
    margin-top: 20px;
    font-size: 12px;
    color: #d1d5db;
  }

  /* ── Responsive ─────────────────────── */
  @media (max-width: 640px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .config-grid { grid-template-columns: 1fr; }
    .stat-value { font-size: 22px; }
  }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>&#127832; AutoBump Dashboard</h1>
    <div class="status-badge">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon">&#127856;</div>
      <div class="stat-value" id="totalBumps">0</div>
      <div class="stat-label">Total Bumps</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#10024;</div>
      <div class="stat-value" id="successRate">0%</div>
      <div class="stat-label">Success Rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#9200;</div>
      <div class="stat-value" id="nextBump">--</div>
      <div class="stat-label">Next Bump</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#128150;</div>
      <div class="stat-value" id="uptime">0m</div>
      <div class="stat-label">Uptime</div>
    </div>
  </div>

  <!-- Channels -->
  <div class="card">
    <div class="card-title">&#128204; Channels</div>
    <div id="channelsList">
      <div class="log-empty">Waiting for data...</div>
    </div>
  </div>

  <!-- Log -->
  <div class="card">
    <div class="card-title">&#128203; Live Log</div>
    <div class="log-container" id="logContainer">
      <div class="log-empty">No logs yet...</div>
    </div>
  </div>

  <!-- Config -->
  <div class="card">
    <div class="card-title">&#9881;&#65039; Configuration</div>
    <div class="config-grid" id="configGrid">
      <div class="log-empty">Loading...</div>
    </div>
  </div>

  <div class="footer">AutoBump Dashboard &mdash; refreshes every 2s</div>
</div>

<script>
  let configLoaded = false;

  async function fetchState() {
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      updateUI(data);
    } catch {
      document.getElementById("statusDot").className = "status-dot";
      document.getElementById("statusText").textContent = "Dashboard disconnected";
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch("/api/config");
      const cfg = await res.json();
      renderConfig(cfg);
      configLoaded = true;
    } catch {}
  }

  function updateUI(s) {
    // Status
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");
    if (s.bot.online) {
      dot.className = "status-dot online";
      text.textContent = "Online as " + s.bot.tag;
    } else {
      dot.className = "status-dot";
      text.textContent = "Offline";
    }

    // Stats
    document.getElementById("totalBumps").textContent = s.stats.total;
    const rate = s.stats.total > 0
      ? Math.round((s.stats.success / s.stats.total) * 100)
      : 0;
    document.getElementById("successRate").textContent = rate + "%";

    // Next bump
    if (s.nextBumpAt) {
      const diff = s.nextBumpAt - Date.now();
      if (diff > 0) {
        const m = Math.floor(diff / 60000);
        const h = Math.floor(m / 60);
        const rm = m % 60;
        document.getElementById("nextBump").textContent =
          h > 0 ? h + "h " + rm + "m" : rm + "m";
      } else {
        document.getElementById("nextBump").textContent = "now";
      }
    } else {
      document.getElementById("nextBump").textContent = "--";
    }

    // Uptime
    if (s.bot.startedAt) {
      const up = Date.now() - s.bot.startedAt;
      const um = Math.floor(up / 60000);
      const uh = Math.floor(um / 60);
      const urm = um % 60;
      document.getElementById("uptime").textContent =
        uh > 0 ? uh + "h " + urm + "m" : urm + "m";
    }

    // Channels
    const cl = document.getElementById("channelsList");
    if (Object.keys(s.channels).length === 0) {
      cl.innerHTML = '<div class="log-empty">No channels tracked yet</div>';
    } else {
      cl.innerHTML = Object.entries(s.channels).map(function(entry) {
        var id = entry[0];
        var ch = entry[1];
        var badge = "";
        if (ch.lastResult === "success") badge = '<span class="badge badge-success">OK</span>';
        else if (ch.lastResult === "cooldown") badge = '<span class="badge badge-waiting">Cooldown</span>';
        else if (ch.lastResult === "fail") badge = '<span class="badge badge-fail">Failed</span>';
        else badge = '<span class="badge badge-waiting">Pending</span>';

        var ago = ch.lastBumpAt ? timeSince(ch.lastBumpAt) : "never";
        return '<div class="channel-row">' +
          '<span class="channel-id">' + id + '</span>' +
          '<span class="channel-status">' +
            badge +
            '<span>Last: ' + ago + '</span>' +
            '<span>Fails: ' + (ch.consecutiveFailures || 0) + '</span>' +
          '</span>' +
        '</div>';
      }).join("");
    }

    // Log
    var lc = document.getElementById("logContainer");
    if (s.log.length === 0) {
      lc.innerHTML = '<div class="log-empty">No logs yet...</div>';
    } else {
      var atBottom = lc.scrollHeight - lc.scrollTop - lc.clientHeight < 50;
      lc.innerHTML = s.log.map(function(l) {
        return '<div class="log-entry">' + escapeHtml(l) + '</div>';
      }).join("");
      if (atBottom) lc.scrollTop = lc.scrollHeight;
    }
  }

  function renderConfig(cfg) {
    var items = [
      ["Interval", cfg.bumpIntervalMinutes + " min"],
      ["Jitter", cfg.jitterMinMinutes + "-" + cfg.jitterMaxMinutes + " min"],
      ["Typing Delay", cfg.typingDelayMs[0] + "-" + cfg.typingDelayMs[1] + " ms"],
      ["Sleep Hours", cfg.sleepHours.enabled
        ? cfg.sleepHours.start + ":00 - " + cfg.sleepHours.end + ":00"
        : "Off"],
      ["Log Max Size", cfg.logRotation.maxSizeMB + " MB"],
      ["Webhook", cfg.webhook.enabled ? "On" : "Off"],
      ["Fail Threshold", cfg.maxConsecutiveFailures + "x"],
      ["Channels", cfg.channels.length || "from .env"],
    ];

    document.getElementById("configGrid").innerHTML = items.map(function(item) {
      return '<div class="config-item">' +
        '<span class="config-key">' + item[0] + '</span>' +
        '<span class="config-val">' + item[1] + '</span>' +
      '</div>';
    }).join("");
  }

  function timeSince(ts) {
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return sec + "s ago";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    var rm = min % 60;
    return hr + "h " + rm + "m ago";
  }

  function escapeHtml(t) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(t));
    return d.innerHTML;
  }

  // Poll every 2 seconds
  fetchState();
  fetchConfig();
  setInterval(fetchState, 2000);
  setInterval(function() { if (!configLoaded) fetchConfig(); }, 5000);
</script>
</body>
</html>`;
}

module.exports = { startDashboard };
