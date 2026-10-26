# Micheal Chat — plan d'upgrade

Objectif : chat moderne (style ChatGPT/Claude), français québécois casual, photo + vidéo + micro + caméra, puis abonnement plus tard.

## État actuel (avant upgrade)

- Stack : Express + frontend statique (`public/`)
- Chat cloud via API compatible OpenAI (Groq en prod : `qwen/qwen3.8-27b`)
- Live : https://micheal-chat.onrender.com
- Repo : https://github.com/Freeze545/micheal-chat

## Phase 1 — prioritaire (ce sprint)

1. **UI moderne** : composer riche, bulles media, toolbar micro/caméra/photo/vidéo, responsive.
2. **Photos** : `POST /api/image` (DALL·E / OpenAI Images / xAI si clé). Sans clé → message amical FR.
3. **Vidéo** : `POST /api/video` avec hook API (Runway / Luma / autre). Sans clé → placeholder clair.
4. **Voix** : Web Speech API (`fr-CA`) pour dicter ; fallback MediaRecorder + note Whisper.
5. **Caméra** : `getUserMedia` → capture JPEG attachée au message (vision multimodale si le modèle le permet).
6. **Env vars** : aucune clé dans le repo ; `.env.example` documenté.

## Clés / APIs à ajouter (Render Dashboard → Environment)

| Variable | Usage | Obligatoire ? |
|----------|--------|----------------|
| `OPENAI_API_KEY` | Chat (+ images si base OpenAI) | Oui pour un vrai modèle |
| `OPENAI_BASE_URL` | Ex. `https://api.openai.com/v1` ou Groq / xAI | Optionnel |
| `OPENAI_MODEL` | Ex. `gpt-4o`, `gpt-4.1`, `claude` via gateway | Oui pour « excellent » |
| `IMAGE_API_KEY` | Override clé images (sinon réutilise OPENAI_*) | Non |
| `IMAGE_BASE_URL` | Endpoint images compatible OpenAI | Non |
| `IMAGE_MODEL` | Ex. `dall-e-3`, `gpt-image-1` | Non (défaut dall-e-3) |
| `VIDEO_API_KEY` | Runway / Luma / autre | Non (placeholder) |
| `VIDEO_API_URL` | Endpoint vidéo custom | Non |
| `VIDEO_PROVIDER` | `runway` \| `luma` \| `openai` \| `stub` | Non |
| `XAI_API_KEY` | Option Grok (xAI) chat/images | Non |
| `ANTHROPIC_API_KEY` | Option Claude (phase 2 via proxy) | Plus tard |
| `GROQ_API_KEY` | Alias possible si on sépare de OPENAI_* | Non |

### Recommandation « beaucoup plus smart »

1. **Court terme** : passer `OPENAI_BASE_URL=https://api.openai.com/v1` + `OPENAI_MODEL=gpt-4o` (ou `gpt-4.1`) avec une vraie clé OpenAI — gros gain immédiat.
2. **Alternatives** : Anthropic Claude 4 / Sonnet via gateway ; xAI Grok ; Groq avec un plus gros modèle.
3. **Images** : clé OpenAI (`dall-e-3` / `gpt-image-1`) ou xAI image.
4. **Vidéo** : Runway Gen-3 / Luma Dream Machine / OpenAI Sora quand dispo — brancher `VIDEO_*`.
5. **Vision caméra** : modèle multimodal (`gpt-4o`, Llama vision sur Groq, etc.).

## Phase 2 — excellent modèle + produit

- Sélecteur de modèle dans les paramètres (user-facing).
- Streaming SSE des réponses.
- Historique multi-conversations (sidebar).
- Auth utilisateurs (email / magic link).

## Phase 3 — abonnement (Stripe — esquisse seulement)

- Produits : Free (limites) / Pro (meilleur modèle + media) / Business.
- Checkout Stripe Checkout + Customer Portal.
- Webhook `checkout.session.completed` → flag `plan` en DB (Supabase ou Postgres Render).
- Middleware : quotas images/vidéos/messages selon le plan.
- **Pas implémenté maintenant** — chat + media + voix + cam d'abord.

## Avatar

Micheal utilise une marque abstraite (`public/avatar.svg`) — **pas de visage humain**.

## Fichiers touchés

- `plan.md` (ce fichier)
- `server.js` — routes `/api/image`, `/api/video`, status enrichi, vision
- `public/index.html`, `public/css/styles.css`, `public/js/app.js`
- `.env.example`, `README.md`, `render.yaml`

## Déploiement

- Push `master` → GitHub ; Render auto-deploy si le service est branché.
- Sinon : Dashboard Render → Manual Deploy, ou `render deploys create`.
- Après deploy : ajouter les env vars manquantes puis **redeploy**.
