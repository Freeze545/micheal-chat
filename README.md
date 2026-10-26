# Micheal Chat

Assistant intelligent **Micheal** — prototype web cloud pour Lucas (Québec).  
Interface en français, thème sombre professionnel, personnalisable.

## Démarrage rapide

```bash
cd /workspace/micheal-chat
npm install
npm start
```

Ouvre ensuite : **http://localhost:3847**

Sans clé API, le site fonctionne en **mode démo** (réponses mock intelligentes qui expliquent comment activer le cloud).

## Activer un modèle fort (cloud)

1. Copie le fichier d’exemple :
   ```bash
   cp .env.example .env
   ```
2. Édite `.env` et ajoute ta clé :
   ```env
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o
   ```
3. Redémarre :
   ```bash
   npm start
   ```

Modèles suggérés : `gpt-4o`, `gpt-4o-mini`, ou tout modèle compatible OpenAI via `OPENAI_BASE_URL`.

## Fonctionnalités

- Chat moderne (thème sombre, avatar professionnel)
- Badge **Cloud** / **Mode démo** selon la présence de `OPENAI_API_KEY`
- Panneau **Paramètres** : nom affiché, personnalité, prompt système, température
- Historique local (navigateur)
- API `POST /api/chat` et `GET /api/status`

## Structure

```
micheal-chat/
├── server.js          # Express + route chat
├── package.json
├── .env.example
├── public/
│   ├── index.html
│   ├── avatar.jpg
│   ├── favicon.svg
│   ├── css/styles.css
│   └── js/app.js
└── README.md
```

## Scripts

| Commande     | Description                |
|--------------|----------------------------|
| `npm start`  | Lance le serveur           |
| `npm run dev`| Relance auto au changement |

## Licence

Prototype privé — usage démo.
