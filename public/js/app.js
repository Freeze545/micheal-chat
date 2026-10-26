/**
 * Micheal Chat — frontend
 */
(function () {
  "use strict";

  const STORAGE_KEY = "micheal-settings-v1";
  const HISTORY_KEY = "micheal-history-v1";

  const DEFAULTS = {
    displayName: "Micheal",
    personality: "Professionnel, clair, québécois casual",
    systemPrompt: `Tu es Micheal, un assistant intelligent professionnel propulsé par le cloud.
Tu aides Lucas, qui vit au Québec. Réponds en français québécois casual — naturel, clair, utile.
Sois concis mais complet. Tu as accès à des capacités cloud avancées : raisonnement, analyse, rédaction, planification.
Ne prétends jamais être un bot local limité ; tu es Micheal, assistant cloud.`,
    temperature: 0.7,
  };

  const SUGGESTIONS = [
    "Salut Micheal, présente-toi",
    "Aide-moi à planifier ma semaine",
    "Quelles sont tes capacités cloud ?",
    "Rédige un courriel pro poliment",
  ];

  const els = {
    messages: document.getElementById("messages"),
    composer: document.getElementById("composer"),
    input: document.getElementById("input"),
    btnSend: document.getElementById("btnSend"),
    sidebar: document.getElementById("sidebar"),
    btnToggleSidebar: document.getElementById("btnToggleSidebar"),
    btnNewChat: document.getElementById("btnNewChat"),
    statusPill: document.getElementById("statusPill"),
    statusLabel: document.getElementById("statusLabel"),
    headerName: document.getElementById("headerName"),
    headerStatus: document.getElementById("headerStatus"),
    sidebarName: document.getElementById("sidebarName"),
    overlay: document.getElementById("overlay"),
    settingsPanel: document.getElementById("settingsPanel"),
    btnOpenSettings: document.getElementById("btnOpenSettings"),
    btnOpenSettingsHeader: document.getElementById("btnOpenSettingsHeader"),
    btnCloseSettings: document.getElementById("btnCloseSettings"),
    settingName: document.getElementById("settingName"),
    settingPersonality: document.getElementById("settingPersonality"),
    settingSystem: document.getElementById("settingSystem"),
    settingTemp: document.getElementById("settingTemp"),
    tempValue: document.getElementById("tempValue"),
    btnSaveSettings: document.getElementById("btnSaveSettings"),
    btnResetSettings: document.getElementById("btnResetSettings"),
  };

  let settings = loadSettings();
  let history = loadHistory();
  let busy = false;
  let apiMode = "unknown";

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function persistHistory() {
    const slim = history.slice(-40);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
  }

  function applyName() {
    const n = settings.displayName || "Micheal";
    els.headerName.textContent = n;
    els.sidebarName.textContent = n;
    document.title = `${n} — Assistant Cloud`;
    els.input.placeholder = `Écris un message à ${n}…`;
  }

  function buildSystemPrompt() {
    let prompt = (settings.systemPrompt || DEFAULTS.systemPrompt).trim();
    if (settings.personality) {
      prompt += `\n\nPersonnalité : ${settings.personality}`;
    }
    if (settings.displayName && settings.displayName !== "Micheal") {
      prompt += `\n\nTon nom affiché est « ${settings.displayName} ».`;
    }
    return prompt;
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      apiMode = data.mode || "demo";
      els.statusPill.classList.remove("cloud", "demo");
      els.statusPill.classList.add(apiMode === "cloud" ? "cloud" : "demo");
      if (apiMode === "cloud") {
        els.statusLabel.textContent = `Cloud · ${data.model || "modèle"}`;
        els.headerStatus.innerHTML =
          '<span class="live-dot"></span> En ligne · Cloud';
      } else {
        els.statusLabel.textContent = "Mode démo";
        els.headerStatus.innerHTML =
          '<span class="live-dot" style="background:var(--warning)"></span> Démo · clé API absente';
      }
    } catch {
      els.statusLabel.textContent = "Hors ligne";
    }
  }

  function clearMessages() {
    els.messages.innerHTML = "";
  }

  function showWelcome() {
    clearMessages();
    const name = settings.displayName || "Micheal";
    const wrap = document.createElement("div");
    wrap.className = "welcome";
    wrap.innerHTML = `
      <img src="/avatar.jpg" alt="${escapeHtml(name)}" class="welcome-avatar" width="88" height="88" />
      <h2>Bonjour, Lucas</h2>
      <p>Je suis <strong>${escapeHtml(name)}</strong>, ton assistant intelligent propulsé par le cloud. Comment puis-je t'aider aujourd'hui ?</p>
      <div class="suggestions"></div>
    `;
    const sug = wrap.querySelector(".suggestions");
    SUGGESTIONS.forEach((text) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggestion";
      b.textContent = text;
      b.addEventListener("click", () => {
        els.input.value = text;
        updateSendState();
        els.composer.requestSubmit();
      });
      sug.appendChild(b);
    });
    els.messages.appendChild(wrap);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function appendMessage(role, content, meta) {
    const welcome = els.messages.querySelector(".welcome");
    if (welcome) welcome.remove();

    const row = document.createElement("div");
    row.className = `msg-row ${role}`;

    if (role === "assistant") {
      const img = document.createElement("img");
      img.src = "/avatar.jpg";
      img.alt = settings.displayName || "Micheal";
      img.className = "msg-avatar";
      img.width = 32;
      img.height = 32;
      row.appendChild(img);
    } else {
      const av = document.createElement("div");
      av.className = "msg-avatar user-av";
      av.textContent = "L";
      av.setAttribute("aria-hidden", "true");
      row.appendChild(av);
    }

    const body = document.createElement("div");
    body.className = "msg-body";
    const metaEl = document.createElement("div");
    metaEl.className = "msg-meta";
    metaEl.textContent =
      role === "assistant" ? settings.displayName || "Micheal" : "Lucas";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = content;
    body.appendChild(metaEl);
    body.appendChild(bubble);

    if (meta) {
      const badge = document.createElement("div");
      badge.className = "msg-badge";
      badge.textContent = meta;
      body.appendChild(badge);
    }

    row.appendChild(body);
    els.messages.appendChild(row);
    els.messages.scrollTop = els.messages.scrollHeight;
    return row;
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "msg-row assistant";
    row.id = "typing-row";
    row.innerHTML = `
      <img src="/avatar.jpg" alt="" class="msg-avatar" width="32" height="32" />
      <div class="msg-body">
        <div class="msg-meta">${escapeHtml(settings.displayName || "Micheal")}</div>
        <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>
      </div>
    `;
    els.messages.appendChild(row);
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById("typing-row");
    if (t) t.remove();
  }

  function showError(msg) {
    const el = document.createElement("div");
    el.className = "error-toast";
    el.textContent = msg;
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
    setTimeout(() => el.remove(), 8000);
  }

  function updateSendState() {
    const has = els.input.value.trim().length > 0;
    els.btnSend.disabled = !has || busy;
  }

  function autoResize() {
    const ta = els.input;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  async function sendMessage(text) {
    if (!text || busy) return;
    busy = true;
    updateSendState();

    appendMessage("user", text);
    history.push({ role: "user", content: text });
    persistHistory();

    showTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          systemPrompt: buildSystemPrompt(),
          displayName: settings.displayName,
          temperature: settings.temperature,
        }),
      });

      const data = await res.json();
      hideTyping();

      if (!res.ok) {
        showError(data.error || "Erreur serveur");
        busy = false;
        updateSendState();
        return;
      }

      const content = data.content || "";
      let badge = null;
      if (data.mode === "demo") badge = "Mode démo";
      else if (data.model) badge = `Cloud · ${data.model}`;

      appendMessage("assistant", content, badge);
      history.push({ role: "assistant", content });
      persistHistory();
    } catch (err) {
      hideTyping();
      showError("Impossible de joindre le serveur. Vérifie que Micheal tourne bien.");
      console.error(err);
    }

    busy = false;
    updateSendState();
    els.input.focus();
  }

  function openSettings() {
    els.settingName.value = settings.displayName || "";
    els.settingPersonality.value = settings.personality || "";
    els.settingSystem.value = settings.systemPrompt || "";
    els.settingTemp.value = settings.temperature ?? 0.7;
    els.tempValue.textContent = Number(els.settingTemp.value).toFixed(1);
    els.overlay.hidden = false;
    els.settingsPanel.classList.add("open");
    els.settingsPanel.setAttribute("aria-hidden", "false");
  }

  function closeSettings() {
    els.overlay.hidden = true;
    els.settingsPanel.classList.remove("open");
    els.settingsPanel.setAttribute("aria-hidden", "true");
  }

  function renderHistory() {
    if (!history.length) {
      showWelcome();
      return;
    }
    clearMessages();
    history.forEach((m) => appendMessage(m.role, m.content));
  }

  /* Events */
  els.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = "";
    autoResize();
    updateSendState();
    sendMessage(text);
  });

  els.input.addEventListener("input", () => {
    updateSendState();
    autoResize();
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.composer.requestSubmit();
    }
  });

  els.btnNewChat.addEventListener("click", () => {
    history = [];
    persistHistory();
    showWelcome();
    els.sidebar.classList.remove("open");
  });

  els.btnToggleSidebar?.addEventListener("click", () => {
    els.sidebar.classList.toggle("open");
  });

  [els.btnOpenSettings, els.btnOpenSettingsHeader].forEach((btn) => {
    btn?.addEventListener("click", openSettings);
  });
  els.btnCloseSettings.addEventListener("click", closeSettings);
  els.overlay.addEventListener("click", closeSettings);

  els.settingTemp.addEventListener("input", () => {
    els.tempValue.textContent = Number(els.settingTemp.value).toFixed(1);
  });

  els.btnSaveSettings.addEventListener("click", () => {
    settings.displayName = els.settingName.value.trim() || "Micheal";
    settings.personality = els.settingPersonality.value.trim();
    settings.systemPrompt = els.settingSystem.value.trim() || DEFAULTS.systemPrompt;
    settings.temperature = Number(els.settingTemp.value);
    saveSettings();
    applyName();
    closeSettings();
  });

  els.btnResetSettings.addEventListener("click", () => {
    settings = { ...DEFAULTS };
    saveSettings();
    els.settingName.value = settings.displayName;
    els.settingPersonality.value = settings.personality;
    els.settingSystem.value = settings.systemPrompt;
    els.settingTemp.value = settings.temperature;
    els.tempValue.textContent = "0.7";
    applyName();
  });

  /* Init */
  applyName();
  renderHistory();
  fetchStatus();
  updateSendState();
  els.input.focus();
})();
