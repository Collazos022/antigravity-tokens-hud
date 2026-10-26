(() => {
  function getActiveConvId() {
    try {
      // 1. TanStack Router state (official router of Antigravity 2.0)
      if (window.__TSR_ROUTER__?.state) {
        const matches = window.__TSR_ROUTER__.state.matches || [];
        for (let i = matches.length - 1; i >= 0; i--) {
          const cid = matches[i]?.params?.cascadeId;
          if (cid) return cid;
        }
        const pathname = window.__TSR_ROUTER__.state.location?.pathname || "";
        const parts = pathname.split("/");
        const idx = parts.indexOf("c");
        if (idx !== -1 && parts[idx + 1]) {
          return parts[idx + 1];
        }
      }

      // 2. Main chat view container in DOM
      const mainChat = document.querySelector("div:not([data-testid=\"conversation-row-sidebar\"])[data-cascade-id]");
      if (mainChat) {
        const id = mainChat.getAttribute("data-cascade-id");
        if (id) return id;
      }

      // 3. Currently selected row in sidebar
      const selRow = document.querySelector("[data-selected=\"true\"][data-cascade-id]") || document.querySelector("[data-selected=\"true\"]");
      if (selRow) {
        const id = selRow.getAttribute("data-cascade-id");
        if (id) return id;
      }

      // 4. Check window.location.pathname (/c/<id>)
      const parts = window.location.pathname.split("/");
      const idx = parts.indexOf("c");
      if (idx !== -1 && parts[idx + 1]) {
        return parts[idx + 1];
      }

      // 5. Any element with data-cascade-id inside main/chat area
      const anyChat = document.querySelector("[data-cascade-id]");
      if (anyChat) {
        const id = anyChat.getAttribute("data-cascade-id");
        if (id) return id;
      }
    } catch (_) {}
    return null;
  }

  function getActiveModelName() {
    try {
      const btns = Array.from(document.querySelectorAll("button"));
      const modelBtn = btns.find(b => b.textContent && (b.textContent.includes("Gemini") || b.textContent.includes("Claude") || b.textContent.includes("GPT")));
      if (modelBtn) {
        const txt = modelBtn.innerText.replace(/\s+/g, " ").trim();
        const m = txt.match(/(Gemini\s+[\d.]+\s+\w+|Claude\s+[\w\s.]+|GPT-[\w\s.]+)/i);
        if (m) return m[1].toLowerCase().replace(/\s+/g, "-");
        return txt.split(" ")[0].toLowerCase();
      }
    } catch (_) {}
    return "gemini-3.8-flash";
  }

  function fmtK(n) {
    if (!n || n <= 0) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return Math.round(n / 1000) + "k";
    return n + "";
  }

  const HUD_VERSION = "v1.1.0";

  const I18N = {
    es: {
      code: "es",
      name: "Español",
      title5h: "Límite 5h",
      titleWeekly: "Semanal",
      now: "ahora",
      d: "d",
      h: "h",
      m: "m",
      aboutTitle: `Antigravity Tokens HUD ${HUD_VERSION}`,
      aboutDesc: "Monitor en tiempo real de tokens y cuotas",
      switchHint: "💡 Haz clic en el widget para alternar idioma (Siguiente: English)"
    },
    en: {
      code: "en",
      name: "English",
      title5h: "5-Hour",
      titleWeekly: "Weekly",
      now: "now",
      d: "d",
      h: "h",
      m: "m",
      aboutTitle: `Antigravity Tokens HUD ${HUD_VERSION}`,
      aboutDesc: "Real-time token & quota monitor",
      switchHint: "💡 Click widget to cycle language (Next: Русский)"
    },
    ru: {
      code: "ru",
      name: "Русский",
      title5h: "5-часовой",
      titleWeekly: "Недельный",
      now: "сейчас",
      d: "д",
      h: "ч",
      m: "м",
      aboutTitle: `Antigravity Tokens HUD ${HUD_VERSION}`,
      aboutDesc: "Мониторинг токенов и квот в реальном времени",
      switchHint: "💡 Нажмите на виджет для смены языка (Далее: Français)"
    },
    fr: {
      code: "fr",
      name: "Français",
      title5h: "Limite 5h",
      titleWeekly: "Hebdo",
      now: "maintenant",
      d: "j",
      h: "h",
      m: "min",
      aboutTitle: `Antigravity Tokens HUD ${HUD_VERSION}`,
      aboutDesc: "Moniteur en temps réel des jetons et quotas",
      switchHint: "💡 Cliquer sur le widget pour changer de langue (Suivant: 中文)"
    },
    zh: {
      code: "zh",
      name: "中文",
      title5h: "5小时限额",
      titleWeekly: "每周限额",
      now: "现在",
      d: "天",
      h: "时",
      m: "分",
      aboutTitle: `Antigravity Tokens HUD ${HUD_VERSION}`,
      aboutDesc: "实时令牌与配额监控",
      switchHint: "💡 点击组件切换语言 (下一个: Español)"
    }
  };

  const LANG_CYCLE = ["es", "en", "ru", "fr", "zh"];

  function getSystemLanguage() {
    try {
      const navLang = (navigator.language || navigator.userLanguage || "es").toLowerCase();
      if (navLang.startsWith("es")) return "es";
      if (navLang.startsWith("ru")) return "ru";
      if (navLang.startsWith("fr")) return "fr";
      if (navLang.startsWith("zh")) return "zh";
      if (navLang.startsWith("en")) return "en";
    } catch (_) {}
    return "es";
  }

  function formatResetTime(seconds, langCode) {
    if (!seconds) return "";
    const sec = parseInt(seconds, 10);
    if (isNaN(sec)) return "";
    const diff = sec - Math.floor(Date.now() / 1000);
    const i18n = I18N[langCode] || I18N.es;
    if (diff <= 0) return i18n.now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    if (days > 0) return `${days}${i18n.d} ${hours}${i18n.h}`;
    if (hours > 0) return `${hours}${i18n.h} ${mins}${i18n.m}`;
    return `${mins}${i18n.m}`;
  }

  async function fetchOfficialQuotas() {
    try {
      const btn = document.querySelector("button");
      if (!btn) return null;
      const fk = Object.keys(btn).find(k => k.startsWith("__reactFiber"));
      if (!fk) return null;
      let cur = btn[fk];
      let client = null;
      while (cur) {
        if (cur.memoizedProps?.value?.retrieveUserQuotaSummary) {
          client = cur.memoizedProps.value;
          break;
        }
        cur = cur.return;
      }
      if (!client) return null;
      const res = await Promise.race([
        client.retrieveUserQuotaSummary({}),
        new Promise(r => setTimeout(() => r(null), 2000))
      ]);
      return res?.response?.groups || null;
    } catch (e) {
      return null;
    }
  }

  let cachedQuotas = null;
  let lastQuotaFetch = 0;

  async function getQuotas() {
    const now = Date.now();
    if (!cachedQuotas || now - lastQuotaFetch > 4000) {
      lastQuotaFetch = now;
      const q = await fetchOfficialQuotas();
      if (q) cachedQuotas = q;
    }
    return cachedQuotas;
  }

  window.__AGY_RENDER__ = async function() {
    const data = window.__AGY_DATA__;
    if (!data) return;

    let container = document.getElementById("antigravity-token-widget");
    const settingsBtn = Array.from(document.querySelectorAll("button")).find(b =>
      b.textContent && (b.textContent.includes("Settings") || b.textContent.includes("Настройки") || b.textContent.includes("Configuración"))
    );
    if (!settingsBtn || !settingsBtn.parentElement) return;

    // Language resolution: localStorage > System language (defaults to Español)
    let currentLang = "es";
    try {
      currentLang = localStorage.getItem("agy_hud_lang") || getSystemLanguage();
    } catch (_) {
      currentLang = getSystemLanguage();
    }
    if (!I18N[currentLang]) currentLang = "es";
    const t = I18N[currentLang];

    if (!container) {
      container = document.createElement("div");
      container.id = "antigravity-token-widget";
      container.style.cssText = [
        "padding: 8px 10px",
        "margin: 4px 8px 8px 8px",
        "border-radius: 8px",
        "background: rgba(255, 255, 255, 0.035)",
        "border: 1px solid rgba(255, 255, 255, 0.07)",
        "font-family: ui-monospace, SFMono-Regular, Menlo, monospace",
        "font-size: 11px",
        "line-height: 1.3",
        "color: rgba(255, 255, 255, 0.85)",
        "user-select: none",
        "cursor: pointer",
        "transition: border-color 0.2s ease, background 0.2s ease"
      ].join("; ");

      container.onmouseenter = () => {
        container.style.borderColor = "rgba(255, 255, 255, 0.15)";
        container.style.background = "rgba(255, 255, 255, 0.05)";
      };
      container.onmouseleave = () => {
        container.style.borderColor = "rgba(255, 255, 255, 0.07)";
        container.style.background = "rgba(255, 255, 255, 0.035)";
      };

      settingsBtn.parentElement.insertBefore(container, settingsBtn);
    } else if (!container.isConnected || container.parentElement !== settingsBtn.parentElement) {
      settingsBtn.parentElement.insertBefore(container, settingsBtn);
    }

    container.style.cursor = "pointer";
    container.onclick = (e) => {
      e.stopPropagation();
      const current = localStorage.getItem("agy_hud_lang") || getSystemLanguage();
      const currentIndex = LANG_CYCLE.indexOf(current);
      const nextLang = LANG_CYCLE[(currentIndex + 1) % LANG_CYCLE.length];
      try {
        localStorage.setItem("agy_hud_lang", nextLang);
      } catch (_) {}
      if (window.__AGY_RENDER__) window.__AGY_RENDER__();
    };

    // 1. Session Context from SQLite
    const activeId = getActiveConvId();
    let session = null;
    if (data.sessions && activeId && data.sessions[activeId]) {
      session = data.sessions[activeId];
    } else if (activeId && data.current_session && data.current_session.session_id === activeId) {
      session = data.current_session;
    } else if (!activeId && data.current_session) {
      session = data.current_session;
    } else {
      session = {
        session_id: activeId || "new",
        context_size: 0,
        max_context: 1000000,
        context_percent: 0.0
      };
    }

    const pct = (session.context_percent != null) ? session.context_percent : 0.0;
    const barWidth = Math.min(100, Math.max(0, pct));
    const ctxK = fmtK(session.context_size || 0);
    const maxK = ((session.max_context || 1000000) >= 1000000) ? "1M" : fmtK(session.max_context);
    const modelName = getActiveModelName();

    // 2. Official Quota Summary from Antigravity Backend
    const quotaGroups = await getQuotas();
    let fiveHourPct = 100;
    let fiveHourReset = "";
    let weeklyPct = 100;
    let weeklyReset = "";

    if (quotaGroups && quotaGroups.length > 0) {
      const geminiGroup = quotaGroups.find(g => g.displayName?.includes("Gemini")) || quotaGroups[0];
      const hBucket = geminiGroup?.buckets?.find(b => b.window === "5h" || b.bucketId?.includes("5h"));
      const wBucket = geminiGroup?.buckets?.find(b => b.window === "weekly" || b.bucketId?.includes("weekly"));

      if (hBucket?.remaining?.value != null) {
        fiveHourPct = Math.round(hBucket.remaining.value * 100);
        fiveHourReset = formatResetTime(hBucket.resetTime?.seconds, currentLang);
      }
      if (wBucket?.remaining?.value != null) {
        weeklyPct = Math.round(wBucket.remaining.value * 100);
        weeklyReset = formatResetTime(wBucket.resetTime?.seconds, currentLang);
      }
    }

    // Tooltip limpio enfocado en "Acerca de", versión y ayuda de cambio de idioma
    container.title = [
      `${t.aboutTitle}`,
      `${t.aboutDesc}`,
      "───────────────────────────────────────",
      t.switchHint,
      "(ES → EN → RU → FR → ZH)"
    ].join("\n");

    container.innerHTML = `
      <!-- 1. Model & Context -->
      <div style="margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-weight: 600; color: #f1f5f9; font-size: 10.5px;">${modelName}</span>
          <span style="font-size: 10px; color: #10b981; font-weight: 600;">${pct.toFixed(1)}% <span style="font-weight: 400; color: #94a3b8;">(${ctxK}/${maxK})</span></span>
        </div>
        <div style="background: rgba(255,255,255,0.08); height: 4px; border-radius: 2px; overflow: hidden;">
          <div style="background: #10b981; width: ${barWidth}%; height: 100%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <!-- 2. 5-Hour Limit Remaining -->
      <div style="margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-weight: 500; color: #94a3b8; font-size: 10px;">${t.title5h}</span>
          <span style="font-size: 9.5px; color: #94a3b8; font-weight: 500;">${fiveHourPct}% ${fiveHourReset ? `<span style="font-weight: 400; color: #64748b;">(${fiveHourReset})</span>` : ""}</span>
        </div>
        <div style="background: rgba(255,255,255,0.06); height: 3.5px; border-radius: 2px; overflow: hidden;">
          <div style="background: #64748b; width: ${fiveHourPct}%; height: 100%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <!-- 3. Weekly Limit Remaining -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-weight: 500; color: #94a3b8; font-size: 10px;">${t.titleWeekly}</span>
          <span style="font-size: 9.5px; color: #94a3b8; font-weight: 500;">${weeklyPct}% ${weeklyReset ? `<span style="font-weight: 400; color: #64748b;">(${weeklyReset})</span>` : ""}</span>
        </div>
        <div style="background: rgba(255,255,255,0.06); height: 3.5px; border-radius: 2px; overflow: hidden;">
          <div style="background: #64748b; width: ${weeklyPct}%; height: 100%; transition: width 0.3s ease;"></div>
        </div>
      </div>
    `;
  };

  if (!window.__AGY_LISTENER_SET__) {
    window.__AGY_LISTENER_SET__ = true;
    let lastId = null;
    let lastPath = window.location.pathname;

    if (window.__TSR_ROUTER__ && typeof window.__TSR_ROUTER__.subscribe === "function") {
      try {
        window.__TSR_ROUTER__.subscribe(() => {
          if (window.__AGY_RENDER__) window.__AGY_RENDER__();
        });
      } catch (_) {}
    }

    setInterval(() => {
      const currentId = getActiveConvId();
      const currentPath = window.location.pathname;
      if (currentId !== lastId || currentPath !== lastPath) {
        lastId = currentId;
        lastPath = currentPath;
        if (window.__AGY_RENDER__) window.__AGY_RENDER__();
      }
    }, 100);
  }

  if (window.__AGY_RENDER__) {
    window.__AGY_RENDER__();
  }
})();
