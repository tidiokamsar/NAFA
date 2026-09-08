/* =================================================================
   Relais du portail AGEROUTE — couche HTTP

   Point d'entrée public du dépôt de candidature et des abonnements.
   Il applique, avant tout appel à Power Automate :
     1. la limitation de débit par adresse (anti-abus) ;
     2. la vérification du CAPTCHA ;
     3. les contrôles serveur EXG-22 / EXG-23 ;
     4. le contrôle de recevabilité de l'offre EXG-26 ;
     5. l'ajout de la clé partagée.

   Guide de déploiement, phase 4 §3.
   ================================================================= */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { Limiteur, adresseClient } = require('./limitation');
const { verifierCaptcha } = require('./captcha');
const { Catalogue } = require('./catalogue');
const { appelerFlux, ErreurFlux } = require('./flux');
const validation = require('./validation');

const TYPES_STATIQUES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2'
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://js.hcaptcha.com",
  "frame-src https://challenges.cloudflare.com https://www.google.com https://newassets.hcaptcha.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'"
].join('; ');

function creerServeur(config, dependances = {}) {
  const journal = dependances.journal || console;
  const recuperer = dependances.fetch || globalThis.fetch;
  const catalogue = dependances.catalogue || new Catalogue(config.catalogue, { fetch: recuperer });

  const limiteurGeneral = new Limiteur(config.limites.requetesParMinute, 60 * 1000);
  const limiteurCandidatures = new Limiteur(config.limites.candidaturesParHeure, 60 * 60 * 1000);
  const limiteurAbonnements = new Limiteur(config.limites.abonnementsParHeure, 60 * 60 * 1000);

  const purge = setInterval(() => {
    const t = Date.now();
    limiteurGeneral.nettoyer(t);
    limiteurCandidatures.nettoyer(t);
    limiteurAbonnements.nettoyer(t);
  }, 10 * 60 * 1000);
  purge.unref();

  /* ------------------------------------------------------------- */

  function entetesSecurite(typeContenu) {
    const entetes = {
      'Content-Type': typeContenu,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };
    if (typeContenu.startsWith('text/html')) {
      entetes['Content-Security-Policy'] = CSP;
    }
    return entetes;
  }

  function appliquerCors(requete, entetes) {
    const origine = requete.headers.origin;
    if (origine && config.originesAutorisees.includes(origine)) {
      entetes['Access-Control-Allow-Origin'] = origine;
      entetes['Vary'] = 'Origin';
      entetes['Access-Control-Allow-Headers'] = 'Content-Type';
      entetes['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      entetes['Access-Control-Max-Age'] = '600';
    }
    return entetes;
  }

  function repondre(requete, reponse, code, charge, entetesSupp) {
    const entetes = appliquerCors(requete, entetesSecurite('application/json; charset=utf-8'));
    Object.assign(entetes, entetesSupp || {});
    const corps = JSON.stringify(charge);
    reponse.writeHead(code, entetes);
    reponse.end(corps);
  }

  /* Lecture du corps avec plafond strict : au-delà, la connexion
     est coupée sans bufferiser davantage. */
  function lireCorps(requete) {
    return new Promise((resolve, reject) => {
      const morceaux = [];
      let taille = 0;
      requete.on('data', (morceau) => {
        taille += morceau.length;
        if (taille > config.tailleMaxCorpsOctets) {
          reject(Object.assign(new Error('corps-trop-volumineux'), { code: 413 }));
          requete.destroy();
          return;
        }
        morceaux.push(morceau);
      });
      requete.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
      requete.on('error', reject);
    });
  }

  async function lireJson(requete) {
    const texte = await lireCorps(requete);
    if (!texte) throw Object.assign(new Error('corps-vide'), { code: 400 });
    try {
      return JSON.parse(texte);
    } catch (erreur) {
      throw Object.assign(new Error('json-invalide'), { code: 400 });
    }
  }

  /* ------------------------------------------------------------- */

  async function traiterCandidature(requete, reponse, ip) {
    const corps = await lireJson(requete);

    const controle = validation.validerCandidature(corps, config.depot);
    if (!controle.valide) {
      return repondre(requete, reponse, controle.code, {
        message: controle.message,
        exigence: controle.exigence
      });
    }

    const captcha = await verifierCaptcha(corps.captcha, config.captcha, { fetch: recuperer });
    if (!captcha.valide) {
      journal.warn(`[candidature] CAPTCHA refusé (${captcha.motif}) — ${ip}`);
      return repondre(requete, reponse, 403, {
        message: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.'
      });
    }

    /* EXG-26 — contrôle de clôture côté serveur. */
    const recherche = await catalogue.trouverOffre(controle.donnees.offreRef);
    if (recherche.disponible) {
      const recevable = validation.verifierRecevabilite(recherche.offre);
      if (!recevable.valide) {
        return repondre(requete, reponse, recevable.code, {
          message: recevable.message,
          exigence: recevable.exigence
        });
      }
    } else if (config.catalogue.obligatoire) {
      journal.error('[candidature] catalogue indisponible et CATALOGUE_OBLIGATOIRE=true');
      return repondre(requete, reponse, 503, {
        message: 'Le service de dépôt est momentanément indisponible. Réessayez dans quelques minutes.'
      });
    } else if (catalogue.configure) {
      journal.warn('[candidature] catalogue indisponible — contrôle délégué à WF-05');
    }

    const quota = limiteurCandidatures.consommer(ip);
    if (!quota.autorise) {
      return repondre(requete, reponse, 429, {
        message: 'Trop de dépôts depuis cette connexion. Réessayez plus tard.'
      }, { 'Retry-After': String(quota.resteSecondes) });
    }

    const resultat = await appelerFlux(config.flux.candidatures, controle.donnees, config,
      { fetch: recuperer });

    journal.info(`[candidature] ${controle.donnees.offreRef} — dossier ${resultat.dossier || '?'} ` +
      `(${controle.donnees.pieces.length} pièces, ${Math.round(controle.tailleTotale / 1024)} Ko)`);

    return repondre(requete, reponse, 200, { dossier: resultat.dossier || null });
  }

  async function traiterAbonnement(requete, reponse, ip) {
    const corps = await lireJson(requete);

    const controle = validation.validerAbonnement(corps);
    if (!controle.valide) {
      return repondre(requete, reponse, controle.code, {
        message: controle.message,
        exigence: controle.exigence
      });
    }

    const captcha = await verifierCaptcha(corps.captcha, config.captcha, { fetch: recuperer });
    if (!captcha.valide) {
      return repondre(requete, reponse, 403, {
        message: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.'
      });
    }

    const quota = limiteurAbonnements.consommer(ip);
    if (!quota.autorise) {
      return repondre(requete, reponse, 429, {
        message: 'Trop de demandes depuis cette connexion. Réessayez plus tard.'
      }, { 'Retry-After': String(quota.resteSecondes) });
    }

    await appelerFlux(config.flux.abonnement, controle.donnees, config, { fetch: recuperer });
    return repondre(requete, reponse, 202, {
      message: 'Un courriel de confirmation a été envoyé.'
    });
  }

  async function traiterJeton(requete, reponse, urlFlux) {
    const corps = await lireJson(requete);
    const controle = validation.validerJeton(corps);
    if (!controle.valide) {
      return repondre(requete, reponse, controle.code, { message: controle.message });
    }
    await appelerFlux(urlFlux, controle.donnees, config, { fetch: recuperer });
    return repondre(requete, reponse, 200, { message: 'Opération enregistrée.' });
  }

  /* ------------------------------------------------------------- */

  function servirStatique(requete, reponse) {
    if (!config.racineStatique) {
      return repondre(requete, reponse, 404, { message: 'Ressource introuvable.' });
    }
    const racine = path.resolve(config.racineStatique);
    const url = new URL(requete.url, 'http://local');
    let relatif = decodeURIComponent(url.pathname);
    if (relatif.endsWith('/')) relatif += 'index.html';

    const cible = path.join(racine, path.normalize(relatif));
    if (!cible.startsWith(racine)) {
      return repondre(requete, reponse, 403, { message: 'Accès refusé.' });
    }

    fs.readFile(cible, (erreur, contenu) => {
      if (erreur) {
        reponse.writeHead(404, entetesSecurite('text/plain; charset=utf-8'));
        reponse.end('404');
        return;
      }
      const type = TYPES_STATIQUES[path.extname(cible)] || 'application/octet-stream';
      reponse.writeHead(200, entetesSecurite(type));
      reponse.end(contenu);
    });
  }

  /* ------------------------------------------------------------- */

  const ROUTES = {
    'POST /api/candidatures': (rq, rp, ip) => traiterCandidature(rq, rp, ip),
    'POST /api/abonnements': (rq, rp, ip) => traiterAbonnement(rq, rp, ip),
    'POST /api/abonnements/confirmer': (rq, rp) => traiterJeton(rq, rp, config.flux.confirmation),
    'POST /api/abonnements/desabonnement': (rq, rp) => traiterJeton(rq, rp, config.flux.desabonnement)
  };

  const serveur = http.createServer(async (requete, reponse) => {
    const url = new URL(requete.url, 'http://local');
    const chemin = url.pathname.replace(/\/+$/, '') || '/';
    const ip = adresseClient(requete, config.proxyDeConfiance);

    if (requete.method === 'OPTIONS') {
      reponse.writeHead(204, appliquerCors(requete, {}));
      reponse.end();
      return;
    }

    if (chemin === '/api/sante') {
      return repondre(requete, reponse, 200, {
        etat: 'ok',
        catalogue: catalogue.configure ? 'configuré' : 'non configuré',
        captcha: config.captcha.fournisseur
      });
    }

    if (!chemin.startsWith('/api/')) {
      return servirStatique(requete, reponse);
    }

    const quota = limiteurGeneral.consommer(ip);
    if (!quota.autorise) {
      return repondre(requete, reponse, 429, {
        message: 'Trop de requêtes. Réessayez dans un instant.'
      }, { 'Retry-After': String(quota.resteSecondes) });
    }

    const route = ROUTES[`${requete.method} ${chemin}`];
    if (!route) {
      return repondre(requete, reponse, 404, { message: 'Ressource introuvable.' });
    }

    try {
      await route(requete, reponse, ip);
    } catch (erreur) {
      if (erreur instanceof ErreurFlux) {
        journal.error(`[relais] ${chemin} — ${erreur.details}: ${erreur.message}`);
        return repondre(requete, reponse, erreur.code, { message: erreur.message });
      }
      if (erreur.code === 413) {
        return repondre(requete, reponse, 413, {
          message: 'Le dossier transmis est trop volumineux.'
        });
      }
      if (erreur.code === 400) {
        return repondre(requete, reponse, 400, { message: 'Requête illisible.' });
      }
      journal.error(`[relais] erreur inattendue sur ${chemin}`, erreur);
      return repondre(requete, reponse, 500, {
        message: 'Une erreur interne est survenue. Réessayez plus tard.'
      });
    }
  });

  serveur.on('close', () => clearInterval(purge));
  return serveur;
}

module.exports = { creerServeur, CSP };
