#!/usr/bin/env node

/**
 * Antigravity Tokens HUD - Sidecar Analytics Server
 * Serves the interactive Auxiliary Pane UI and telemetry API.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PORT = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || process.env.PORT || "61337", 10);
const TOKEN_STATS_SCRIPT = path.join(__dirname, "..", "..", "token_stats.py");

function findPythonBinary() {
  if (process.platform === "win32") {
    const directCandidates = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
      "C:\\Users\\cared\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
    ];
    for (const cand of directCandidates) {
      if (cand && fs.existsSync(cand)) return cand;
    }
    const baseDir = path.join(process.env.LOCALAPPDATA || "", "Programs", "Python");
    if (fs.existsSync(baseDir)) {
      try {
        const subdirs = fs.readdirSync(baseDir);
        for (const sub of subdirs) {
          const cand = path.join(baseDir, sub, "python.exe");
          if (fs.existsSync(cand)) return cand;
        }
      } catch (_) {}
    }
    return "python";
  }
  return "python3";
}

const PYTHON_BIN = findPythonBinary();

function fetchStats() {
  return new Promise((resolve) => {
    // Si no encuentra el script en la ruta relativa del plugin, busca en ~/.antigravity-tokens-hud
    let scriptPath = TOKEN_STATS_SCRIPT;
    if (!fs.existsSync(scriptPath)) {
      const fallback = path.join(process.env.USERPROFILE || "", ".antigravity-tokens-hud", "token_stats.py");
      if (fs.existsSync(fallback)) scriptPath = fallback;
    }

    if (!fs.existsSync(scriptPath)) {
      resolve({ error: "token_stats.py not found" });
      return;
    }

    const env = { ...process.env };
    execFile(PYTHON_BIN, [scriptPath, "--json"], { timeout: 8000, env }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ error: "Failed to collect stats", details: String(err) });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        resolve({ error: "Invalid JSON output", raw: stdout });
      }
    });
  });
}

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Tokens & Quotas Analytics</title>
  <style>
    :root {
      --bg: #121214;
      --card-bg: #1c1c21;
      --card-hover: #232329;
      --border: #2a2a32;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --emerald: #10b981;
      --cyan: #38bdf8;
      --indigo: #6366f1;
      --amber: #f59e0b;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      padding: 16px;
      line-height: 1.4;
      overflow-y: auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .title-group h1 {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.2px;
      color: #fff;
    }
    .title-group p {
      font-size: 11px;
      color: var(--text-muted);
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--emerald);
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 10.5px;
      font-weight: 500;
    }
    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 6px var(--emerald);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.4; }
      50% { opacity: 1; }
      100% { opacity: 0.4; }
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      transition: background 0.2s, border-color 0.2s;
    }
    .card:hover {
      background: var(--card-hover);
      border-color: #3b3b45;
    }
    .card-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
    }
    .card-value {
      font-size: 20px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: #fff;
      margin-bottom: 8px;
    }
    .card-sub {
      font-size: 11px;
      color: var(--text-muted);
    }

    .progress-bar-wrap {
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.06);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 6px;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.4s ease;
    }

    .section-title {
      font-size: 12.5px;
      font-weight: 600;
      color: #fff;
      margin: 16px 0 10px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .token-breakdown {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .token-pill {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
    }
    .token-pill-label {
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .token-pill-val {
      font-size: 14px;
      font-weight: 600;
      font-family: var(--font-mono);
      color: #fff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 8px;
    }
    th {
      text-align: left;
      padding: 8px 10px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-weight: 500;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      color: #e2e8f0;
      font-family: var(--font-mono);
    }
    tr:hover td {
      background: rgba(255,255,255,0.02);
    }

    .footer-note {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: var(--text-muted);
    }
    .btn-refresh {
      background: #2a2a32;
      color: #fff;
      border: 1px solid #3b3b45;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-refresh:hover { background: #3b3b45; }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <div class="title-group">
        <h1>Tokens & Quotas Analytics</h1>
        <p>Google Antigravity 2.0 • Telemetría en Tiempo Real</p>
      </div>
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <span class="badge-status"><span class="live-dot"></span> EN VIVO</span>
      <button class="btn-refresh" onclick="loadStats()">↻ Actualizar</button>
    </div>
  </div>

  <!-- Fila 1: 3 Tarjetas Clave -->
  <div class="grid-3">
    <div class="card">
      <div class="card-label"><span>CONTEXTO ACTIVO</span><span id="ctx-pct">0%</span></div>
      <div class="card-value" id="ctx-val">0</div>
      <div class="card-sub" id="ctx-sub">Ventana de contexto actual</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="ctx-bar" style="background: var(--emerald); width: 0%;"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-label"><span>CONSUMO 5 HORAS</span><span id="h5-req">0 reqs</span></div>
      <div class="card-value" id="h5-val">0</div>
      <div class="card-sub" id="h5-sub">Tokens usados en la ventana rodante</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="h5-bar" style="background: var(--cyan); width: 45%;"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-label"><span>CONSUMO SEMANAL</span><span id="wk-req">0 reqs</span></div>
      <div class="card-value" id="wk-val">0</div>
      <div class="card-sub" id="wk-sub">Tokens usados en los últimos 7 días</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="wk-bar" style="background: var(--indigo); width: 20%;"></div>
      </div>
    </div>
  </div>

  <!-- Fila 2: Desglose de Tokens -->
  <div class="section-title">⚡ Desglose de Tokens de la Conversación</div>
  <div class="token-breakdown">
    <div class="token-pill">
      <div class="token-pill-label">📥 Prompt Tokens</div>
      <div class="token-pill-val" id="pill-prompt">0</div>
    </div>
    <div class="token-pill">
      <div class="token-pill-label">⚡ Cache Read</div>
      <div class="token-pill-val" id="pill-cache" style="color: var(--cyan);">0</div>
    </div>
    <div class="token-pill">
      <div class="token-pill-label">🧠 Thinking (Razonamiento)</div>
      <div class="token-pill-val" id="pill-thinking" style="color: var(--amber);">0</div>
    </div>
    <div class="token-pill">
      <div class="token-pill-label">✍️ Generación (Output)</div>
      <div class="token-pill-val" id="pill-output" style="color: var(--emerald);">0</div>
    </div>
  </div>

  <!-- Fila 3: Sesiones Recientes -->
  <div class="section-title">📋 Conversaciones Recientes Registradas</div>
  <div class="card" style="padding: 4px; overflow-x: auto;">
    <table>
      <thead>
        <tr>
          <th>ID de Conversación</th>
          <th>Tokens Usados</th>
          <th>% Contexto</th>
          <th>Thinking</th>
          <th>Output</th>
        </tr>
      </thead>
      <tbody id="sessions-table">
        <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px;">Cargando sesiones...</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer-note">
    <span>💡 Widget de barra lateral (sobre Settings): <strong>Activo y sincronizado</strong></span>
    <span id="last-update">Actualizado: --</span>
  </div>

  <script>
    function fmtK(n) {
      if (!n || n <= 0) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return Number(n).toLocaleString();
    }

    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.error) return;

        // 1. Current Session
        const curr = data.current_session || {};
        const pct = curr.context_percent || 0;
        document.getElementById('ctx-pct').innerText = pct.toFixed(1) + '%';
        document.getElementById('ctx-val').innerText = fmtK(curr.context_size) + ' / ' + fmtK(curr.max_context || 1000000);
        document.getElementById('ctx-bar').style.width = Math.min(100, Math.max(0, pct)) + '%';
        document.getElementById('ctx-sub').innerText = 'Sesión: ' + (curr.session_id ? curr.session_id.slice(0, 8) + '...' : 'Activa');

        // 2. 5h Usage
        const u5 = data.usage_5h || {};
        document.getElementById('h5-val').innerText = fmtK(u5.total_tokens || 0);
        document.getElementById('h5-req').innerText = (u5.total_requests || 0) + ' reqs';

        // 3. Weekly Usage
        const uw = data.usage_weekly || {};
        document.getElementById('wk-val').innerText = fmtK(uw.total_tokens || 0);
        document.getElementById('wk-req').innerText = (uw.total_requests || 0) + ' reqs';

        // 4. Breakdown Pills
        document.getElementById('pill-prompt').innerText = fmtK(curr.prompt_tokens || 0);
        document.getElementById('pill-cache').innerText = fmtK(curr.cached_tokens || 0);
        document.getElementById('pill-thinking').innerText = fmtK(curr.thinking_tokens || 0);
        document.getElementById('pill-output').innerText = fmtK(curr.output_tokens || 0);

        // 5. Sessions Table
        const sessions = data.sessions || {};
        const tbody = document.getElementById('sessions-table');
        const rows = Object.values(sessions).slice(0, 8);
        if (rows.length > 0) {
          tbody.innerHTML = rows.map(s => \`
            <tr>
              <td style="color: #94a3b8;">\${(s.session_id || '').slice(0, 18)}...</td>
              <td style="color: #fff; font-weight: 600;">\${fmtK(s.context_size)}</td>
              <td style="color: var(--emerald);">\${(s.context_percent || 0).toFixed(1)}%</td>
              <td style="color: var(--amber);">\${fmtK(s.thinking_tokens)}</td>
              <td style="color: var(--cyan);">\${fmtK(s.output_tokens)}</td>
            </tr>
          \`).join('');
        }

        document.getElementById('last-update').innerText = 'Actualizado: ' + new Date().toLocaleTimeString();
      } catch (e) {
        console.error('Error fetching stats:', e);
      }
    }

    loadStats();
    setInterval(loadStats, 3000);
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  if (url === "/api/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    const stats = await fetchStats();
    res.end(JSON.stringify(stats));
    return;
  }

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML_DASHBOARD);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("[Tokens HUD Sidecar] Running on http://127.0.0.1:" + PORT);
});
