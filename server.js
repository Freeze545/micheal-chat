/**
 * Micheal Chat — serveur Express
 * API OpenAI-compatible (Groq / OpenAI) via OPENAI_API_KEY.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'qwen/qwen3.8-27b';
const API_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

const DEFAULT_SYSTEM = `Tu es Micheal, un assistant intelligent professionnel propulsé par le cloud.
Tu aides Lucas, qui vit au Québec. Réponds en français québécois casual — naturel, clair, utile.
Sois concis mais complet. Tu as accès à des capacités cloud avancées : raisonnement, analyse, rédaction, planification.
Ne prétends jamais être un bot local limité ; tu es Micheal, assistant cloud.
Reste dans le légal : refuse ce qui est illégal ou clairement dangereux.`;

function hasApiKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

function mockReply(userMessage, displayName) {
  const name = displayName || 'Micheal';
  const lower = (userMessage || '').toLowerCase();
  if (/bonjour|salut|allo|hey|hello|bonsoir/.test(lower)) {
    return `Salut Lucas ! Je suis ${name}. Mode démo — ajoute une clé API pour le cloud.`;
  }
  return `Mode démo : configure OPENAI_API_KEY (ou Groq) dans .env puis redémarre.`;
}

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    name: 'Micheal',
    cloud: true,
    apiConfigured: hasApiKey(),
    model: hasApiKey() ? DEFAULT_MODEL : null,
    mode: hasApiKey() ? 'cloud' : 'demo',
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
    const userText = lastUser?.content || '';

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
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m) => ({ role: m.role, content: String(m.content) })),
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
        ? 'Clé API invalide. Vérifie ta clé Groq / OpenAI.'
        : status === 429
          ? 'Limite de débit atteinte. Réessaie dans un moment.'
          : `Erreur cloud : ${err.message || 'inconnue'}`;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: msg,
      mode: 'error',
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
  console.log(`  →  Mode : ${mode}\n`);
});
