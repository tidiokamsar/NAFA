# =================================================================
#  Relais du portail AGEROUTE — image d'exécution
# =================================================================
#  Le service n'a aucune dépendance npm : l'image se limite au
#  runtime Node et au code source. Pas d'étape de build, pas de
#  node_modules, pas de gestionnaire de paquets dans l'image finale.
# =================================================================
FROM node:22-alpine

# Utilisateur non privilégié : l'image node fournit déjà « node ».
WORKDIR /app

COPY package.json ./
COPY src ./src

USER node

# Le port est configurable ; 8080 est la valeur par défaut du service.
ENV PORT=8080
EXPOSE 8080

# La sonde interroge le service lui-même : si le processus répond,
# la configuration a été validée au démarrage (sinon il s'arrête).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node reçoit directement SIGTERM : l'arrêt gracieux du serveur
# (fermeture des connexions en cours) fonctionne sans init externe.
CMD ["node", "src/index.js"]
