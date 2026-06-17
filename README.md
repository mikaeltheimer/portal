# Interstice

Une expérience de connexion éphémère entre deux inconnus.

## Concept

Deux personnes. Une salle. Un geste simultané.  
Quand les deux maintiennent leur doigt sur le cercle en même temps, un portail s'ouvre — uniquement leur présence sonore, l'une dans l'espace de l'autre, dans une cathédrale imaginaire.  
Dès qu'un des deux relâche, le portail se ferme définitivement.

---

## Installation locale

```bash
npm install
npm run dev
```

Ouvrir `http://localhost:3000` dans **deux onglets ou navigateurs différents** pour tester.

---

## Déploiement sur Railway

Railway supporte les serveurs Node.js custom, ce qui est requis ici (Socket.io ne fonctionne pas sur Vercel sans configuration spéciale).

### Étapes

1. Créer un compte sur [railway.app](https://railway.app)

2. Installer Railway CLI :
```bash
npm install -g @railway/cli
railway login
```

3. Dans le dossier du projet :
```bash
railway init
railway up
```

4. Railway détecte automatiquement le `package.json` et utilise `npm start` → `node server.js`.

5. Dans le dashboard Railway, aller dans **Settings → Networking** et activer un domaine public.

### Variables d'environnement (si nécessaire)
- `PORT` — Railway le définit automatiquement
- `NODE_ENV=production`

---

## Déploiement sur Render

1. Créer un compte sur [render.com](https://render.com)
2. New → **Web Service** → connecter le repo GitHub
3. Build command : `npm install && npm run build`
4. Start command : `npm start`
5. Le domaine est généré automatiquement.

---

## Architecture technique

```
server.js          — Serveur HTTP custom (Next.js + Socket.io)
pages/index.js     — Interface complète de l'expérience
hooks/useWebRTC.js — Connexion audio peer-to-peer + réverbération
styles/globals.css — Design tokens
```

### Flux de connexion

```
Utilisateur A entre → crée une salle, attend seul
Utilisateur B entre → rejoint la salle de A
→ Les deux voient le cercle s'activer
→ A ou B pose le doigt → signal "holding" envoyé à l'autre
→ Quand les DEUX maintiennent simultanément → portail ouvert
→ WebRTC peer-to-peer s'établit, audio s'écoule
→ Réverbération de cathédrale appliquée au signal entrant
→ Un relâche → portail fermé → salle détruite définitivement
```

### Notes techniques

- **WebRTC** : connexion directe navigateur-à-navigateur, le son ne passe pas par le serveur
- **STUN servers** : Google STUN utilisé pour traverser les NAT. Pour les environnements restrictifs (réseaux d'entreprise), un serveur TURN serait nécessaire.
- **Réverbération** : générée synthétiquement via Web Audio API ConvolverNode. Une vraie impulsion (IR) de cathédrale améliorerait le réalisme — voir [OpenAirLib](https://www.openair.hosted.york.ac.uk/) pour des IR gratuites.
- **Simultanéité** : le serveur vérifie que les deux utilisateurs envoient `hold-start` avant d'émettre `portal-open`. Pas de tolérance temporelle — si les deux cliquent à 1ms d'intervalle, ça fonctionne. Le délai réseau naturel est suffisant.

---

## Améliorations futures possibles

- Remplacer l'IR synthétique par une vraie impulsion de cathédrale
- Ajouter un serveur TURN pour les connexions difficiles
- Version multilingue (EN/FR)
- Compteur discret du nombre de connexions ayant eu lieu depuis le lancement
