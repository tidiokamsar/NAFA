#!/usr/bin/env node
/* =================================================================
   Serveur statique de développement — sans dépendance.
   Sert public/ pour relire le portail localement.

     node outils/serveur-dev.js [port]

   En production, le contenu de public/ est déposé tel quel sur
   l'hébergement de opportunites.ageroute.gov.gn : ce serveur n'est
   qu'un confort de relecture.
   ================================================================= */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..', 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf'
};

const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let relatif = decodeURIComponent(url.pathname);
  if (relatif.endsWith('/')) relatif += 'index.html';

  const cible = path.join(RACINE, path.normalize(relatif));
  if (!cible.startsWith(RACINE)) {
    res.writeHead(403).end('Interdit');
    return;
  }

  fs.readFile(cible, (erreur, contenu) => {
    if (erreur) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — ' + relatif);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(cible)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(contenu);
  });
});

serveur.listen(PORT, () => {
  console.log(`Portail servi sur http://localhost:${PORT}`);
});
