/**
 * Micheal Chat — serveur Express
 * Chat OpenAI-compatible + génération image/vidéo + vision (caméra).
 */
require('dotenv').config();

(function assembleKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20) return;
  const parts = [];
  for (let i = 0; i < 20; i++) {
    const p = process.env['OPENAI_API_KEY_P' + i];
    if (!p) break;
    parts.push(p);
  }
  if (parts.length) process.env.OPENAI_API_KEY = parts.join('');
})();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'qwen/qwen3.8-27b';
const API_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

const IMAGE_MODEL = process.env.IMAGE_MODEL || 'dall-e-3';

const VIDEO_KEY = process.env.VIDEO_API_KEY || '';
const VIDEO_URL = (process.env.VIDEO_API_URL || '').replace(/\/$/, '');
const VIDEO_PROVIDER = (process.env.VIDEO_PROVIDER || 'stub').toLowerCase();

/** Groq (and many chat-only gateways) have no /images/generations — don't pretend. */
function resolveImageConfig() {
  const explicitKey = (process.env.IMAGE_API_KEY || '').trim();
  const explicitBase = (process.env.IMAGE_BASE_URL || '').trim().replace(/\/$/, '');
  const chatKey = (process.env.OPENAI_API_KEY || '').trim();
  const chatBase = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const xaiKey = (process.env.XAI_API_KEY || '').trim();

  function imageCapable(base) {
    const b = (base || '').toLowerCase();
    if (!b) return false;
    if (b.includes('groq.com')) return false;
    return (
      b.includes('api.openai.com') ||
      b.includes('api.x.ai') ||
      b.includes('openai.com') ||
      Boolean(explicitBase)
    );
  }

  if (explicitKey && explicitBase) {
    return { key: explicitKey, base: explicitBase };
  }
  if (explicitKey) {
    const base = explicitBase || (imageCapable(chatBase) ? chatBase : 'https://api.openai.com/v1');
    return { key: explicitKey, base };
  }
  if (explicitBase && chatKey && imageCapable(explicitBase)) {
    return { key: chatKey, base: explicitBase };
  }
  if (xaiKey) {
    return { key: xaiKey, base: explicitBase || 'https://api.x.ai/v1' };
  }
  if (chatKey && imageCapable(chatBase)) {
    return { key: chatKey, base: chatBase };
  }
  return { key: '', base: '' };
}

const _img = resolveImageConfig();
const IMAGE_KEY = _img.key;
const IMAGE_BASE = _img.base;

const DEFAULT_SYSTEM = `Tu es Micheal, un assistant intelligent professionnel propulsé par le cloud.
Tu aides Lucas, qui vit au Québec. Réponds en français québécois casual — naturel, clair, utile.
Sois concis mais complet. Tu as accès à des capacités cloud avancées : raisonnement, analyse, rédaction, planification,
création de photos (via l'outil image), création de vidéos (quand configuré), et analyse d'images/caméra.
Ne prétends jamais être un bot local limité ; tu es Micheal, assistant cloud.
Reste dans le légal : refuse ce qui est illégal ou clairement dangereux.
Si l'utilisateur joint une photo (caméra), décris et analyse ce que tu vois utilement.`;

function hasApiKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

function hasImageKey() {
  return Boolean(IMAGE_KEY && IMAGE_KEY.trim());
}

function hasVideoKey() {
  return Boolean(VIDEO_KEY && VIDEO_KEY.trim() && VIDEO_URL);
}

function mockReply(userMessage, displayName) {
  const name = displayName || 'Micheal';
  const lower = (userMessage || '').toLowerCase();
  if (/bonjour|salut|allo|hey|hello|bonsoir/.test(lower)) {
    return `Salut Lucas ! Je suis ${name}. Mode démo — ajoute une clé API pour le cloud.`;
  }
  return `Mode démo : configure OPENAI_API_KEY (OpenAI, Groq, xAI…) dans .env puis redémarre.`;
}

/** Normalize message content: string or multimodal parts */
function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content;
  if (content == null) return '';
  return String(content);
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && (p.type === 'text' || typeof p.text === 'string'))
      .map((p) => p.text || '')
      .join('\n');
  }
  return String(content || '');
}

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    name: 'Micheal',
    cloud: true,
    apiConfigured: hasApiKey(),
    model: hasApiKey() ? DEFAULT_MODEL : null,
    mode: hasApiKey() ? 'cloud' : 'demo',
    capabilities: {
      chat: true,
      image: hasImageKey(),
      video: hasVideoKey(),
      vision: hasApiKey(),
      voice: true, // browser Web Speech
      camera: true, // browser getUserMedia
    },
    imageModel: hasImageKey() ? IMAGE_MODEL : null,
    videoProvider: hasVideoKey() ? VIDEO_PROVIDER : 'stub',
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages = [],
      systemPrompt,
      displayName,
      temperature = 0.7,
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages requis (tableau non vide)' });
    }

    const system = (systemPrompt && String(systemPrompt).trim()) || DEFAULT_SYSTEM;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userText = extractText(lastUser?.content);

    if (!hasApiKey()) {
      return res.json({
        role: 'assistant',
        content: mockReply(userText, displayName),
        mode: 'demo',
        model: null,
      });
    }

    const apiMessages = [
      { role: 'system', content: system },
      ...messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content != null)
        .map((m) => ({ role: m.role, content: normalizeContent(m.content) })),
    ];

    const r = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: apiMessages,
        temperature: Math.min(1.5, Math.max(0, Number(temperature) || 0.7)),
        max_tokens: 2048,
      }),
    });

    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Réponse invalide (${r.status}): ${raw.slice(0, 200)}`);
    }

    if (!r.ok) {
      const errMsg = data?.error?.message || raw.slice(0, 200);
      const err = new Error(errMsg);
      err.status = r.status;
      throw err;
    }

    const content =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning ||
      '(Réponse vide du modèle)';

    return res.json({
      role: 'assistant',
      content,
      mode: 'cloud',
      model: data.model || DEFAULT_MODEL,
    });
  } catch (err) {
    console.error('[Micheal] chat error:', err.message);
    const status = err.status || err.statusCode || 500;
    const msg =
      status === 401
        ? 'Clé API invalide. Vérifie ta clé Groq / OpenAI / xAI.'
        : status === 429
          ? 'Limite de débit atteinte. Réessaie dans un moment.'
          : `Erreur cloud : ${err.message || 'inconnue'}`;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: msg,
      mode: 'error',
    });
  }
});

/**
 * POST /api/image
 * body: { prompt, size?, quality? }
 */
app.post('/api/image', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt requis pour générer une image' });
    }
    if (!hasImageKey()) {
      return res.status(503).json({
        error:
          'Génération d’images non configurée. Ajoute IMAGE_API_KEY ou OPENAI_API_KEY (avec un endpoint images, ex. api.openai.com) dans les variables d’environnement Render, puis redéploie.',
        configured: false,
        hint: 'Voir plan.md — IMAGE_API_KEY, IMAGE_MODEL=dall-e-3',
      });
    }

    const size = req.body?.size || '1024x1024';
    const quality = req.body?.quality || 'standard';

    const r = await fetch(`${IMAGE_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${IMAGE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size,
        quality: IMAGE_MODEL.includes('dall-e') ? quality : undefined,
        response_format: 'url',
      }),
    });

    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Réponse images invalide (${r.status}): ${raw.slice(0, 200)}`);
    }

    if (!r.ok) {
      const errMsg = data?.error?.message || raw.slice(0, 240);
      const err = new Error(errMsg);
      err.status = r.status;
      throw err;
    }

    const item = data.data?.[0] || {};
    const url = item.url || null;
    const b64 = item.b64_json || null;
    if (!url && !b64) {
      return res.status(502).json({ error: 'Aucune image renvoyée par le fournisseur.' });
    }

    return res.json({
      ok: true,
      url,
      b64: b64 ? `data:image/png;base64,${b64}` : null,
      revisedPrompt: item.revised_prompt || null,
      model: IMAGE_MODEL,
      prompt,
    });
  } catch (err) {
    console.error('[Micheal] image error:', err.message);
    const status = err.status || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: `Erreur image : ${err.message || 'inconnue'}`,
      configured: hasImageKey(),
    });
  }
});

/**
 * POST /api/video
 * body: { prompt, duration? }
 * Sans VIDEO_API_KEY → stub amical avec hook clair.
 */
app.post('/api/video', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt requis pour générer une vidéo' });
    }

    if (!hasVideoKey()) {
      return res.json({
        ok: false,
        stub: true,
        configured: false,
        provider: VIDEO_PROVIDER || 'stub',
        message:
          'La vidéo n’est pas encore branchée. Ajoute VIDEO_API_KEY + VIDEO_API_URL (Runway, Luma, Sora…) dans Render, puis redéploie. En attendant, décris ta scène — Micheal peut préparer le prompt.',
        prompt,
        nextSteps: [
          'Créer un compte Runway / Luma / OpenAI Sora',
          'Mettre VIDEO_PROVIDER=runway (ou luma / openai)',
          'Mettre VIDEO_API_URL et VIDEO_API_KEY',
          'Redéployer le service Render',
        ],
      });
    }

    // Generic hook: POST { prompt } to VIDEO_API_URL with Bearer key
    const r = await fetch(VIDEO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VIDEO_KEY}`,
        'Content-Type': 'application/json',
        'X-Video-Provider': VIDEO_PROVIDER,
      },
      body: JSON.stringify({
        prompt,
        duration: req.body?.duration || 4,
        provider: VIDEO_PROVIDER,
      }),
    });

    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw: raw.slice(0, 500) };
    }

    if (!r.ok) {
      return res.status(r.status >= 400 && r.status < 600 ? r.status : 502).json({
        error: data?.error?.message || data?.error || `Erreur vidéo (${r.status})`,
        configured: true,
        provider: VIDEO_PROVIDER,
      });
    }

    return res.json({
      ok: true,
      stub: false,
      configured: true,
      provider: VIDEO_PROVIDER,
      url: data.url || data.video_url || data.output || null,
      id: data.id || data.job_id || null,
      status: data.status || 'submitted',
      prompt,
      raw: data,
    });
  } catch (err) {
    console.error('[Micheal] video error:', err.message);
    return res.status(500).json({
      error: `Erreur vidéo : ${err.message || 'inconnue'}`,
      configured: hasVideoKey(),
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const mode = hasApiKey() ? `cloud (${DEFAULT_MODEL})` : 'démo (pas de clé API)';
  console.log(`\n  ☁  Micheal Chat prêt`);
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  →  Mode : ${mode}`);
  console.log(`  →  Images : ${hasImageKey() ? IMAGE_MODEL : 'non configuré'}`);
  console.log(`  →  Vidéo  : ${hasVideoKey() ? VIDEO_PROVIDER : 'stub'}\n`);
});
