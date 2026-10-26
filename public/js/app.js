/**
 * Micheal Chat — frontend (chat + photo + vidéo + micro + caméra)
 * Avatar : marque abstraite /avatar.svg (pas de visage humain)
 */
(function () {
  "use strict";

  const STORAGE_KEY = "micheal-settings-v1";
  const HISTORY_KEY = "micheal-history-v1";
  const AVATAR = "/avatar.svg";

  const DEFAULTS = {
    displayName: "Micheal",
    personality: "Professionnel, clair, québécois casual",
    systemPrompt: `Tu es Micheal, un assistant intelligent professionnel propulsé par le cloud.
Tu aides Lucas, qui vit au Québec. Réponds en français québécois casual — naturel, clair, utile.
Sois concis mais complet. Tu as accès à des capacités cloud avancées : raisonnement, analyse, rédaction, planification,
création de photos, création de vidéos (si configuré), et analyse d'images/caméra.
Ne prétends jamais être un bot local limité ; tu es Micheal, assistant cloud.`,
    temperature: 0.7,
  };

  const SUGGESTIONS = [
    "Salut Micheal, présente-toi",
    "Crée une photo d’un lever de soleil sur le Saint-Laurent",
    "Prépare un prompt vidéo d’un drone au-dessus de Québec",
    "Aide-moi à planifier ma semaine",
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
    btnMic: document.getElementById("btnMic"),
    btnCam: document.getElementById("btnCam"),
    modeBar: document.getElementById("modeBar"),
    attachPreview: document.getElementById("attachPreview"),
    attachThumb: document.getElementById("attachThumb"),
    btnClearAttach: document.getElementById("btnClearAttach"),
    cameraModal: document.getElementById("cameraModal"),
    camVideo: document.getElementById("camVideo"),
    camCanvas: document.getElementById("camCanvas"),
    btnCloseCam: document.getElementById("btnCloseCam"),
    btnCamCancel: document.getElementById("btnCamCancel"),
    btnCamCapture: document.getElementById("btnCamCapture"),
    composerHint: document.getElementById("composerHint"),
    capList: document.getElementById("capList"),
  };

  let settings = loadSettings();
  let history = loadHistory();
  let busy = false;
  let apiMode = "unknown";
  let caps = { chat: true, image: false, video: false, vision: false, voice: true, camera: true };
  let mode = "chat"; // chat | image | video
  let pendingAttach = null; // data URL from camera
  let recognition = null;
  let listening = false;
  let camStream = null;

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
    // Strip huge base64 from old entries when persisting lightly — keep last 30 text-ish
    const slim = history.slice(-30).map((m) => {
      if (typeof m.content === "string") return m;
      // Keep multimodal but cap: store as-is for session; if too big, keep text only
      try {
        const s = JSON.stringify(m);
        if (s.length > 400000) {
          return { role: m.role, content: extractPlain(m.content) + "\n[image jointe omise de l’historique local]" };
        }
      } catch { /* ignore */ }
      return m;
    });
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
    } catch {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-10).map((m) => ({
        role: m.role,
        content: extractPlain(m.content),
      }))));
    }
  }

  function extractPlain(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    }
    return String(content || "");
  }

  function applyName() {
    const n = settings.displayName || "Micheal";
    els.headerName.textContent = n;
    els.sidebarName.textContent = n;
    document.title = `${n} — Assistant Cloud`;
    updatePlaceholder();
  }

  function updatePlaceholder() {
    const n = settings.displayName || "Micheal";
    if (mode === "image") {
      els.input.placeholder = `Décris la photo à créer…`;
      els.composerHint.textContent = "Mode photo — Micheal génère une image à partir de ton prompt.";
    } else if (mode === "video") {
      els.input.placeholder = `Décris la vidéo à créer…`;
      els.composerHint.textContent = "Mode vidéo — branché si VIDEO_API_* est configuré, sinon guide clair.";
    } else {
      els.input.placeholder = `Écris à ${n}, ou dicte avec le micro…`;
      els.composerHint.textContent = "Micheal peut faire des erreurs. Micro · caméra · photos · vidéo.";
    }
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

  function setCapPills() {
    if (!els.capList) return;
    els.capList.querySelectorAll("[data-cap]").forEach((li) => {
      const key = li.getAttribute("data-cap");
      const on =
        key === "chat" ? true :
        key === "voice" || key === "camera" ? true :
        Boolean(caps[key]);
      li.classList.toggle("on", on);
      li.classList.toggle("off", !on);
      if (key === "image" && !caps.image) li.title = "Ajoute IMAGE_API_KEY / OpenAI images";
      if (key === "video" && !caps.video) li.title = "Ajoute VIDEO_API_KEY + VIDEO_API_URL";
    });
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      apiMode = data.mode || "demo";
      caps = Object.assign(caps, data.capabilities || {});
      setCapPills();
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
      <img src="${AVATAR}" alt="${escapeHtml(name)}" class="welcome-avatar" width="96" height="96" />
      <h2>Bonjour, Lucas</h2>
      <p>Je suis <strong>${escapeHtml(name)}</strong> — chat, photos, vidéo, micro et caméra. Qu’est-ce qu’on fait ?</p>
      <div class="suggestions"></div>
    `;
    const sug = wrap.querySelector(".suggestions");
    SUGGESTIONS.forEach((text) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggestion";
      b.textContent = text;
      b.addEventListener("click", () => {
        if (/photo|image/i.test(text)) setMode("image");
        else if (/vidéo|video/i.test(text)) setMode("video");
        else setMode("chat");
        els.input.value = text.replace(/^Crée une photo d[’']/, "").replace(/^Prépare un prompt vidéo d[’']/, "");
        if (/photo/i.test(text)) els.input.value = "Un lever de soleil doré sur le fleuve Saint-Laurent, style cinématique";
        if (/vidéo|video/i.test(text)) els.input.value = "Drone au-dessus de la vieille ville de Québec au crépuscule, mouvement fluide";
        if (/Salut|planifier/i.test(text)) els.input.value = text;
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

  function appendMessage(role, content, meta, media) {
    const welcome = els.messages.querySelector(".welcome");
    if (welcome) welcome.remove();

    const row = document.createElement("div");
    row.className = `msg-row ${role}`;

    if (role === "assistant") {
      const img = document.createElement("img");
      img.src = AVATAR;
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

    const plain = extractPlain(content);
    if (media && media.imageDataUrl) {
      const wrap = document.createElement("div");
      wrap.className = "attach-inline";
      const im = document.createElement("img");
      im.src = media.imageDataUrl;
      im.alt = "Photo jointe";
      wrap.appendChild(im);
      bubble.appendChild(wrap);
    }
    if (plain) {
      const textNode = document.createElement("span");
      textNode.textContent = plain;
      bubble.appendChild(textNode);
    }

    if (media && media.resultImage) {
      const mw = document.createElement("div");
      mw.className = "bubble-media";
      const im = document.createElement("img");
      im.src = media.resultImage;
      im.alt = "Image générée";
      mw.appendChild(im);
      bubble.appendChild(mw);
    }
    if (media && media.resultVideo) {
      const mw = document.createElement("div");
      mw.className = "bubble-media";
      const v = document.createElement("video");
      v.src = media.resultVideo;
      v.controls = true;
      v.playsInline = true;
      mw.appendChild(v);
      bubble.appendChild(mw);
    }

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
      <img src="${AVATAR}" alt="" class="msg-avatar" width="32" height="32" />
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
    setTimeout(() => el.remove(), 10000);
  }

  function showInfo(msg) {
    const el = document.createElement("div");
    el.className = "info-toast";
    el.textContent = msg;
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
    setTimeout(() => el.remove(), 10000);
  }

  function updateSendState() {
    const has = els.input.value.trim().length > 0 || pendingAttach;
    els.btnSend.disabled = !has || busy;
  }

  function autoResize() {
    const ta = els.input;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  function setMode(next) {
    mode = next;
    els.modeBar.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    updatePlaceholder();
  }

  function clearAttach() {
    pendingAttach = null;
    els.attachPreview.hidden = true;
    els.attachThumb.removeAttribute("src");
    updateSendState();
  }

  function setAttach(dataUrl) {
    pendingAttach = dataUrl;
    els.attachThumb.src = dataUrl;
    els.attachPreview.hidden = false;
    updateSendState();
  }

  /* ——— Chat / Image / Video send ——— */
  async function sendMessage(text) {
    if (busy) return;
    const trimmed = (text || "").trim();
    if (!trimmed && !pendingAttach) return;

    if (mode === "image") {
      return generateImage(trimmed || "une scène créative");
    }
    if (mode === "video") {
      return generateVideo(trimmed || "une scène cinématique courte");
    }

    busy = true;
    updateSendState();

    const attach = pendingAttach;
    clearAttach();

    let content;
    if (attach) {
      content = [
        { type: "text", text: trimmed || "Voici ce que je te montre avec ma caméra. Qu’est-ce que tu vois ?" },
        { type: "image_url", image_url: { url: attach } },
      ];
      appendMessage("user", trimmed || "Voici ce que je te montre.", null, { imageDataUrl: attach });
    } else {
      content = trimmed;
      appendMessage("user", trimmed);
    }

    history.push({ role: "user", content });
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

      const reply = data.content || "";
      let badge = null;
      if (data.mode === "demo") badge = "Mode démo";
      else if (data.model) badge = `Cloud · ${data.model}`;

      appendMessage("assistant", reply, badge);
      history.push({ role: "assistant", content: reply });
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

  async function generateImage(prompt) {
    busy = true;
    updateSendState();
    appendMessage("user", `🖼️ Photo : ${prompt}`);
    history.push({ role: "user", content: `[Demande de photo] ${prompt}` });
    persistHistory();
    showTyping();

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      hideTyping();

      if (!res.ok || data.error) {
        const msg = data.error || "Erreur image";
        appendMessage("assistant", msg, "Images");
        history.push({ role: "assistant", content: msg });
        persistHistory();
        busy = false;
        updateSendState();
        return;
      }

      const src = data.url || data.b64;
      const text = data.revisedPrompt
        ? `Voici ta photo.\n(Prompt révisé : ${data.revisedPrompt})`
        : "Voici ta photo.";
      appendMessage("assistant", text, `Image · ${data.model || "api"}`, { resultImage: src });
      history.push({ role: "assistant", content: text + (src ? `\n[image: ${src.slice(0, 80)}…]` : "") });
      persistHistory();
    } catch (err) {
      hideTyping();
      showError("Échec de la génération d’image.");
      console.error(err);
    }
    busy = false;
    updateSendState();
  }

  async function generateVideo(prompt) {
    busy = true;
    updateSendState();
    appendMessage("user", `🎬 Vidéo : ${prompt}`);
    history.push({ role: "user", content: `[Demande de vidéo] ${prompt}` });
    persistHistory();
    showTyping();

    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      hideTyping();

      if (data.stub || !data.ok) {
        const steps = (data.nextSteps || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
        const msg =
          (data.message || data.error || "Vidéo non configurée.") +
          (steps ? `\n\nProchaines étapes :\n${steps}` : "");
        appendMessage("assistant", msg, "Vidéo · stub");
        history.push({ role: "assistant", content: msg });
        persistHistory();
        busy = false;
        updateSendState();
        return;
      }

      const text = `Vidéo (${data.provider}) — statut : ${data.status || "ok"}`;
      appendMessage("assistant", text, `Vidéo · ${data.provider}`, data.url ? { resultVideo: data.url } : null);
      history.push({ role: "assistant", content: text + (data.url ? `\n${data.url}` : "") });
      persistHistory();
    } catch (err) {
      hideTyping();
      showError("Échec de la requête vidéo.");
      console.error(err);
    }
    busy = false;
    updateSendState();
  }

  /* ——— Voice (Web Speech) ——— */
  function setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      els.btnMic.title = "Reconnaissance vocale non supportée sur ce navigateur (essaie Chrome)";
      return;
    }
    recognition = new SR();
    recognition.lang = "fr-CA";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      listening = true;
      els.btnMic.classList.add("recording");
    };
    recognition.onend = () => {
      listening = false;
      els.btnMic.classList.remove("recording");
    };
    recognition.onerror = (e) => {
      listening = false;
      els.btnMic.classList.remove("recording");
      if (e.error !== "aborted" && e.error !== "no-speech") {
        showInfo("Micro : " + e.error + ". Autorise le micro dans le navigateur.");
      }
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (finalText) {
        els.input.value = (els.input.value ? els.input.value + " " : "") + finalText.trim();
        updateSendState();
        autoResize();
      } else if (interim) {
        // show interim lightly by not overwriting committed text — skip for simplicity
      }
    };
  }

  function toggleMic() {
    if (!recognition) {
      showInfo("La dictée vocale n’est pas dispo ici. Utilise Chrome/Edge, ou tape ton message.");
      return;
    }
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      showInfo("Impossible de démarrer le micro.");
    }
  }

  /* ——— Camera ——— */
  async function openCamera() {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      els.camVideo.srcObject = camStream;
      els.cameraModal.hidden = false;
    } catch (err) {
      // try user-facing
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        els.camVideo.srcObject = camStream;
        els.cameraModal.hidden = false;
      } catch (e2) {
        showError("Caméra inaccessible. Autorise l’accès caméra dans ton navigateur (HTTPS requis).");
      }
    }
  }

  function closeCamera() {
    els.cameraModal.hidden = true;
    if (camStream) {
      camStream.getTracks().forEach((t) => t.stop());
      camStream = null;
    }
    els.camVideo.srcObject = null;
  }

  function captureCamera() {
    const video = els.camVideo;
    const canvas = els.camCanvas;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setAttach(dataUrl);
    setMode("chat");
    closeCamera();
    showInfo("Photo capturée — ajoute un message si tu veux, puis envoie.");
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
    history.forEach((m) => {
      const plain = extractPlain(m.content);
      let media = null;
      if (Array.isArray(m.content)) {
        const img = m.content.find((p) => p.type === "image_url");
        if (img?.image_url?.url) media = { imageDataUrl: img.image_url.url };
      }
      appendMessage(m.role, plain, null, media);
    });
  }

  /* Events */
  els.composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text && !pendingAttach) return;
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
    clearAttach();
    setMode("chat");
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

  els.modeBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn) return;
    setMode(btn.dataset.mode);
  });

  els.btnMic.addEventListener("click", toggleMic);
  els.btnCam.addEventListener("click", openCamera);
  els.btnCloseCam.addEventListener("click", closeCamera);
  els.btnCamCancel.addEventListener("click", closeCamera);
  els.btnCamCapture.addEventListener("click", captureCamera);
  els.btnClearAttach.addEventListener("click", clearAttach);

  /* Init */
  applyName();
  renderHistory();
  fetchStatus();
  setupSpeech();
  updateSendState();
  els.input.focus();
})();
