#!/usr/bin/env node
/* =================================================================
   Relais du portail AGEROUTE — démarrage
   ================================================================= */
'use strict';

const { config, verifier, avertissements } = require('./config');
const { creerServeur } = require('./serveur');

const anomalies = verifier(config);
if (anomalies.length) {
  console.error('Configuration invalide, démarrage interrompu :');
  anomalies.forEach((a) => console.error('  - ' + a));
  process.exit(1);
}
avertissements(config).forEach((m) => console.warn('  ! ' + m));

const serveur = creerServeur(config);

serveur.listen(config.port, () => {
  /* Le port effectif, et non celui demandé : avec PORT=0 le noyau
     en attribue un, et l'exploitation doit savoir lequel. */
  const port = serveur.address().port;
  console.log(`Relais du portail à l'écoute sur le port ${port}`);
  console.log(`  CAPTCHA        : ${config.captcha.fournisseur}`);
  console.log(`  Catalogue      : ${config.catalogue.source || 'non configuré'}`);
  console.log(`  Statique       : ${config.racineStatique || 'désactivé'}`);
});

function arreter(signal) {
  console.log(`\n${signal} reçu — arrêt en cours…`);
  serveur.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
