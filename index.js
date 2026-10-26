#!/usr/bin/env node

/**
 * Antigravity Tokens HUD - Background Daemon
 * Injects token & quota monitors into Antigravity 2.0 via Chrome DevTools Protocol.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

// Global fail-safe: prevent process from ever terminating unexpectedly
process.on("uncaughtException", (err) => {
  // Silent fail-safe
});
process.on("unhandledRejection", (reason) => {
  // Silent fail-safe
});

function getDevToolsFilePath() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library/Application Support/Antigravity/DevToolsActivePort");
  } else if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData/Roaming");
    return path.join(appData, "Antigravity/DevToolsActivePort");
  } else {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    return path.join(configHome, "Antigravity/DevToolsActivePort");
  }
}

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

const DEVTOOLS_FILE = getDevToolsFilePath();
const TOKEN_STATS_SCRIPT = path.join(__dirname, "token_stats.py");
const CLIENT_SCRIPT_PATH = fs.existsSync(path.join(__dirname, "client_widget.js"))
  ? path.join(__dirname, "client_widget.js")
  : path.join(__dirname, "client_widget_injector.js");
const CONFIG_FILE = path.join(__dirname, "config.json");
const PYTHON_BIN = findPythonBinary();

let cdpMessageId = 1;
function nextCdpId() {
  cdpMessageId = (cdpMessageId + 1) & 0x7fffffff;
  return cdpMessageId;
}

// Map of pageId -> { ws, pageId, url }
const activePages = new Map();
let currentPort = null;
let isUpdating = false;

function getConfigLang() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (cfg && cfg.lang) return cfg.lang;
    }
  } catch (_) {}
  return "es";
}

function getDevToolsInfo() {
  if (!fs.existsSync(DEVTOOLS_FILE)) return null;
  try {
    const content = fs.readFileSync(DEVTOOLS_FILE, "utf8").trim().split("\n");
    if (content.length >= 1 && content[0]) {
      const port = parseInt(content[0].trim(), 10);
      if (!isNaN(port) && port > 0) return { port };
    }
  } catch (_) {}
  return null;
}

async function listAntigravityPages(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    const list = await res.json();
    return list.filter(p => p.type === "page" && p.url && (p.url.includes("127.0.0.1") || p.url.includes("localhost") || p.url.includes("antigravity")));
  } catch (_) {
    return [];
  }
}

function fetchTokenStats() {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (process.platform !== "win32") {
      env.PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":");
    }
    execFile(PYTHON_BIN, [TOKEN_STATS_SCRIPT, "--json"], { timeout: 8000, env }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (_) {
        resolve(null);
      }
    });
  });
}

function connectPageWebSocket(page) {
  return new Promise((resolve) => {
    let resolved = false;
    let ws = null;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { if (ws) ws.close(); } catch (_) {}
        resolve(null);
      }
    }, 2000);

    try {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      const entry = { ws, pageId: page.id, url: page.url };

      ws.onopen = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          activePages.set(page.id, entry);
          resolve(entry);
        }
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.error) {
            const msgText = data.error.message || "";
            if (msgText.includes("execution context") || msgText.includes("detached") || msgText.includes("Target closed")) {
              try { ws.close(); } catch (_) {}
              activePages.delete(page.id);
            }
          }
        } catch (_) {}
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
        activePages.delete(page.id);
      };

      ws.onclose = () => {
        activePages.delete(page.id);
      };
    } catch (_) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

function cleanupPages() {
  for (const [id, entry] of activePages) {
    try { entry.ws.close(); } catch (_) {}
  }
  activePages.clear();
}

async function updateLoop() {
  if (isUpdating) return;
  isUpdating = true;

  try {
    const info = getDevToolsInfo();
    if (!info) {
      if (activePages.size > 0) cleanupPages();
      currentPort = null;
      return;
    }

    if (currentPort !== info.port) {
      cleanupPages();
      currentPort = info.port;
    }

    const pages = await listAntigravityPages(currentPort);
    if (!pages || pages.length === 0) {
      // Antigravity might be closed or starting up
      if (activePages.size > 0) cleanupPages();
      return;
    }

    const currentPageIds = new Set(pages.map(p => p.id));

    // Remove closed pages
    for (const [id, entry] of activePages) {
      if (!currentPageIds.has(id)) {
        try { entry.ws.close(); } catch (_) {}
        activePages.delete(id);
      }
    }

    // Connect any new pages
    for (const page of pages) {
      const existing = activePages.get(page.id);
      if (!existing || existing.ws.readyState !== WebSocket.OPEN) {
        if (existing) {
          try { existing.ws.close(); } catch (_) {}
          activePages.delete(page.id);
        }
        await connectPageWebSocket(page);
      }
    }

    if (activePages.size === 0) return;

    const stats = await fetchTokenStats();
    if (!stats) return;

    let clientScript = "";
    try {
      clientScript = fs.readFileSync(CLIENT_SCRIPT_PATH, "utf8");
    } catch (_) {}

    const lang = getConfigLang();
    const payload = JSON.stringify(stats);

    for (const [id, entry] of activePages) {
      if (entry.ws.readyState !== WebSocket.OPEN) continue;

      const evalCode = `
        window.__AGY_DATA__ = ${payload};
        window.__AGY_LANG__ = ${JSON.stringify(lang)};
        ${clientScript}
      `;

      try {
        entry.ws.send(JSON.stringify({
          id: nextCdpId(),
          method: "Runtime.evaluate",
          params: {
            expression: evalCode,
            returnByValue: false
          }
        }));
      } catch (_) {
        activePages.delete(id);
      }
    }
  } catch (_) {
    // Silent fail-safe
  } finally {
    isUpdating = false;
  }
}

console.log("[Antigravity Tokens HUD] Daemon running. Python:", PYTHON_BIN);
setInterval(updateLoop, 1000);
updateLoop();
