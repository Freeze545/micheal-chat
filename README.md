# Micheal Chat

Assistant intelligent **Micheal** — chat cloud moderne pour Lucas (Québec).  
Interface française, avatar **abstrait** (pas de photo humaine), photos · vidéo · micro · caméra.

Live : https://micheal-chat.onrender.com

## Démarrage

```bash
cd micheal-chat
cp .env.example .env   # puis ajoute tes clés
npm install
npm start
```

→ http://localhost:3847

## Capacités

| Fonction | Comment |
|----------|---------|
| Chat | `OPENAI_API_KEY` (+ modèle fort recommandé) |
| Photos | `IMAGE_API_KEY` ou OpenAI images (`dall-e-3`) |
| Vidéo | `VIDEO_API_KEY` + `VIDEO_API_URL` (sinon stub) |
| Micro | Web Speech API `fr-CA` (Chrome/Edge) |
| Caméra | `getUserMedia` → image jointe au message |

Voir **[plan.md](./plan.md)** pour les clés, le passage à un modèle « excellent », et l’esquisse Stripe.

## Avatar

Micheal utilise `/public/avatar.svg` — marque nuage / IA abstraite. **Aucune photo de visage humain.**

## Structure

```
micheal-chat/
├── plan.md
├── server.js              # /api/chat, /api/image, /api/video, /api/status
├── public/
│   ├── index.html
│   ├── avatar.svg         # avatar non-humain
│   ├── favicon.svg
│   ├── css/styles.css
│   └── js/app.js
├── .env.example
└── render.yaml
```

## Déploiement Render

Push sur `master` si le service est connecté au repo.  
Sinon : Dashboard → Manual Deploy. Ajoute les env vars manquantes puis redeploy.

## Licence

Prototype privé.
