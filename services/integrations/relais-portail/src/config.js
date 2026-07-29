/* =================================================================
   Relais du portail AGEROUTE — configuration

   Toutes les valeurs sensibles proviennent de l'environnement :
   les URL des déclencheurs Power Automate (WF-05, WF-08) sont des
   secrets d'exploitation (CDC §7.3) et ne doivent apparaître ni
   dans le dépôt, ni dans le code du front public.
   ================================================================= */
'use strict';

function texte(nom, defaut = '') {
  const v = process.env[nom];
  return v === undefined || v === null ? defaut : String(v).trim();
}

function nombre(nom, defaut) {
  const v = process.env[nom];
  if (v === undefined || v === '') return defaut;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaut;
}

function booleen(nom, defaut) {
  const v = texte(nom).toLowerCase();
  if (v === '') return defaut;
  return v === 'true' || v === '1' || v === 'oui';
}

function liste(nom) {
  return texte(nom).split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
  port: nombre('PORT', 8080),
  racineStatique: texte('RACINE_STATIQUE'),

  /* Déclencheurs Power Automate */
  flux: {
    candidatures: texte('URL_FLUX_CANDIDATURES'),
    abonnement: texte('URL_FLUX_ABONNEMENT'),
    confirmation: texte('URL_FLUX_CONFIRMATION'),
    desabonnement: texte('URL_FLUX_DESABONNEMENT')
  },
  clePartagee: texte('CLE_PARTAGEE'),
  entetesCle: texte('ENTETE_CLE_PARTAGEE', 'x-cle-relais'),
  delaiFluxMs: nombre('DELAI_FLUX_MS', 30000),

  /* CAPTCHA : turnstile | recaptcha | hcaptcha | aucun */
  captcha: {
    fournisseur: texte('CAPTCHA_FOURNISSEUR', 'aucun').toLowerCase(),
    secret: texte('CAPTCHA_SECRET'),
    delaiMs: nombre('CAPTCHA_DELAI_MS', 8000)
  },

  /* Catalogue publié : sert au contrôle d'existence et de clôture
     de l'offre avant relais (EXG-26, défense en profondeur). */
  catalogue: {
    source: texte('SOURCE_CATALOGUE'),
    dureeCacheMs: nombre('CATALOGUE_CACHE_MS', 120000),
    obligatoire: booleen('CATALOGUE_OBLIGATOIRE', false)
  },

  /* Contraintes de dépôt — doivent rester alignées sur EXG-22 et
     sur les contrôles du flux WF-05. */
  depot: {
    extensions: (liste('EXTENSIONS_AUTORISEES').length
      ? liste('EXTENSIONS_AUTORISEES')
      : ['pdf', 'docx', 'jpg', 'jpeg', 'png']).map((e) => e.toLowerCase()),
    tailleMaxFichierOctets: nombre('TAILLE_MAX_FICHIER_MO', 10) * 1024 * 1024,
    tailleMaxTotalOctets: nombre('TAILLE_MAX_TOTAL_MO', 30) * 1024 * 1024,
    nombreMaxPieces: nombre('NOMBRE_MAX_PIECES', 10)
  },

  /* Limitation de débit */
  limites: {
    candidaturesParHeure: nombre('LIMITE_CANDIDATURES_HEURE', 5),
    abonnementsParHeure: nombre('LIMITE_ABONNEMENTS_HEURE', 10),
    requetesParMinute: nombre('LIMITE_REQUETES_MINUTE', 30)
  },

  /* Réseau */
  proxyDeConfiance: booleen('PROXY_DE_CONFIANCE', false),
  originesAutorisees: liste('ORIGINES_AUTORISEES'),
  tailleMaxCorpsOctets: nombre('TAILLE_MAX_CORPS_MO', 48) * 1024 * 1024,

  journalDetaille: booleen('JOURNAL_DETAILLE', false)
};

/* Contrôles au démarrage : mieux vaut refuser de démarrer que
   d'accepter des dépôts qui ne partiront nulle part. */
function verifier(cfg = config) {
  const anomalies = [];
  if (!cfg.flux.candidatures) {
    anomalies.push('URL_FLUX_CANDIDATURES est obligatoire (déclencheur WF-05).');
  }
  if (cfg.captcha.fournisseur !== 'aucun' && !cfg.captcha.secret) {
    anomalies.push(`CAPTCHA_SECRET est obligatoire avec CAPTCHA_FOURNISSEUR=${cfg.captcha.fournisseur}.`);
  }
  if (!['turnstile', 'recaptcha', 'hcaptcha', 'aucun'].includes(cfg.captcha.fournisseur)) {
    anomalies.push(`CAPTCHA_FOURNISSEUR inconnu : ${cfg.captcha.fournisseur}.`);
  }
  if (cfg.depot.tailleMaxFichierOctets > cfg.depot.tailleMaxTotalOctets) {
    anomalies.push('TAILLE_MAX_FICHIER_MO ne peut pas dépasser TAILLE_MAX_TOTAL_MO.');
  }
  return anomalies;
}

/* Avertissements non bloquants : le service démarre, mais la
   fonction concernée sera refusée proprement. */
function avertissements(cfg = config) {
  const messages = [];
  if (!cfg.flux.abonnement) messages.push('URL_FLUX_ABONNEMENT absente : les inscriptions seront refusées (503).');
  if (!cfg.flux.confirmation) messages.push('URL_FLUX_CONFIRMATION absente : les confirmations seront refusées (503).');
  if (!cfg.flux.desabonnement) messages.push('URL_FLUX_DESABONNEMENT absente : les désabonnements seront refusés (503).');
  if (!cfg.clePartagee) messages.push('CLE_PARTAGEE absente : les appels aux flux ne seront pas signés.');
  if (cfg.captcha.fournisseur === 'aucun') messages.push('CAPTCHA désactivé : à ne pas laisser en production.');
  if (!cfg.catalogue.source) messages.push('SOURCE_CATALOGUE absente : le contrôle de clôture repose uniquement sur WF-05.');
  return messages;
}

module.exports = { config, verifier, avertissements };
