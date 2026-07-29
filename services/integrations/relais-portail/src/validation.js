/* =================================================================
   Relais du portail AGEROUTE — contrôles serveur

   Fonctions pures, sans effet de bord : ce sont elles qui portent
   les exigences EXG-22 (formats et tailles), EXG-23 (consentement)
   et la partie « données » de EXG-26 (offre recevable).

   Le contrôle client du site public est un confort d'usage ; c'est
   ce module, et le flux WF-05, qui font foi.
   ================================================================= */
'use strict';

const REFERENCE = /^[A-Z]{2}\/\d{4}\/\d{2,4}$/;
const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const CONTROLE = /[\u0000-\u001F\u007F]/g;
const THEMES = ['AO', 'Recrutement', 'Les deux'];

const LONGUEURS = {
  nom: 80,
  prenom: 80,
  courriel: 120,
  telephone: 30,
  nomFichier: 120,
  jeton: 120
};

function estChaine(v) {
  return typeof v === 'string';
}

function nettoyer(valeur, longueurMax) {
  if (!estChaine(valeur)) return '';
  /* Suppression des caractères de contrôle, y compris les retours
     à la ligne qui permettraient une injection d'en-tête plus loin
     dans la chaîne (courriels envoyés par WF-05). */
  return valeur
    .replace(CONTROLE, ' ')
    .trim()
    .slice(0, longueurMax);
}

function extensionDe(nom) {
  const pos = String(nom).lastIndexOf('.');
  return pos === -1 ? '' : String(nom).slice(pos + 1).toLowerCase();
}

/* Un nom de pièce arrive du poste du candidat : il ne doit jamais
   pouvoir sortir du dossier Candidatures/<NumeroDossier>. */
function nettoyerNomFichier(nom) {
  const base = String(nom || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  return base
    .replace(CONTROLE, '')
    .replace(/[<>:"|?*#%{}~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, LONGUEURS.nomFichier);
}

/* Taille réelle du contenu décodé, sans le décoder en mémoire.
   Renvoie null si la chaîne n'est pas du base64 exploitable. */
function tailleBase64(chaine) {
  if (!estChaine(chaine)) return null;
  const compact = chaine.replace(/\s+/g, '');
  if (compact.length === 0) return null;
  if (compact.length % 4 !== 0) return null;
  if (!BASE64.test(compact)) return null;
  const remplissage = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return (compact.length / 4) * 3 - remplissage;
}

function refus(code, message, exigence) {
  return { valide: false, code, message, exigence: exigence || null };
}

/* ---------------------------------------------------------------
   Candidature (WF-05)
   --------------------------------------------------------------- */
function validerCandidature(corps, depot) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    return refus(400, 'Requête illisible.');
  }

  const offreRef = nettoyer(corps.offreRef, 20).toUpperCase();
  if (!REFERENCE.test(offreRef)) {
    return refus(400, 'Référence d\'offre invalide.');
  }

  const nom = nettoyer(corps.nom, LONGUEURS.nom);
  const prenom = nettoyer(corps.prenom, LONGUEURS.prenom);
  const courriel = nettoyer(corps.courriel, LONGUEURS.courriel).toLowerCase();
  const telephone = nettoyer(corps.telephone, LONGUEURS.telephone);

  if (!nom || !prenom) {
    return refus(400, 'Le nom et le prénom sont obligatoires.');
  }
  if (!COURRIEL.test(courriel)) {
    return refus(400, 'Adresse électronique invalide.');
  }
  if (telephone && !/^[0-9+()\s.-]{6,}$/.test(telephone)) {
    return refus(400, 'Numéro de téléphone invalide.');
  }

  /* EXG-23 — le consentement doit être explicite, pas déduit. */
  if (corps.consentement !== true) {
    return refus(400, 'Le consentement au traitement des données est obligatoire.', 'EXG-23');
  }

  /* EXG-22 — formats et tailles des pièces. */
  const pieces = corps.pieces;
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return refus(400, 'Aucune pièce jointe : le dossier doit comporter au moins un document.', 'EXG-22');
  }
  if (pieces.length > depot.nombreMaxPieces) {
    return refus(400, `Le dossier ne peut pas comporter plus de ${depot.nombreMaxPieces} pièces.`, 'EXG-22');
  }

  const maxFichierMo = Math.round(depot.tailleMaxFichierOctets / 1048576);
  const maxTotalMo = Math.round(depot.tailleMaxTotalOctets / 1048576);
  const propres = [];
  let total = 0;

  for (const piece of pieces) {
    if (!piece || typeof piece !== 'object') {
      return refus(400, 'Pièce jointe illisible.', 'EXG-22');
    }
    const nomFichier = nettoyerNomFichier(piece.nom);
    if (!nomFichier) {
      return refus(400, 'Une pièce jointe est dépourvue de nom exploitable.', 'EXG-22');
    }
    const extension = extensionDe(nomFichier);
    if (!depot.extensions.includes(extension)) {
      return refus(400,
        `Format refusé pour « ${nomFichier} ». Formats acceptés : ${depot.extensions.join(', ')}.`,
        'EXG-22');
    }
    const taille = tailleBase64(piece.contenuBase64);
    if (taille === null) {
      return refus(400, `Le contenu de « ${nomFichier} » est illisible.`, 'EXG-22');
    }
    if (taille === 0) {
      return refus(400, `Le fichier « ${nomFichier} » est vide.`, 'EXG-22');
    }
    if (taille > depot.tailleMaxFichierOctets) {
      return refus(400, `« ${nomFichier} » dépasse la taille maximale de ${maxFichierMo} Mo.`, 'EXG-22');
    }
    total += taille;
    propres.push({ nom: nomFichier, contenuBase64: piece.contenuBase64.replace(/\s+/g, '') });
  }

  if (total > depot.tailleMaxTotalOctets) {
    return refus(400, `Le dossier dépasse la taille totale autorisée de ${maxTotalMo} Mo.`, 'EXG-22');
  }

  return {
    valide: true,
    /* Charge utile conforme au schéma attendu par WF-05 : rien
       d'autre n'est transmis (le jeton CAPTCHA reste au relais). */
    donnees: {
      offreRef,
      nom,
      prenom,
      courriel,
      telephone,
      consentement: true,
      pieces: propres
    },
    tailleTotale: total
  };
}

/* ---------------------------------------------------------------
   Offre recevable — EXG-26 (défense en profondeur)
   --------------------------------------------------------------- */
function verifierRecevabilite(offre, maintenant = new Date()) {
  if (!offre) {
    return refus(404, 'Cette offre n\'existe pas ou n\'est plus publiée.', 'EXG-26');
  }
  if (offre.statut !== 'Publié') {
    return refus(409, 'Cette offre est clôturée : les candidatures ne sont plus recevables.', 'EXG-26');
  }
  const limite = new Date(offre.cloture);
  if (isNaN(limite.getTime())) {
    return refus(409, 'La date limite de cette offre est indéterminée.', 'EXG-26');
  }
  if (limite <= maintenant) {
    return refus(409, 'La date limite de dépôt est dépassée.', 'EXG-26');
  }
  return { valide: true };
}

/* ---------------------------------------------------------------
   Abonnement (WF-08)
   --------------------------------------------------------------- */
function validerAbonnement(corps) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    return refus(400, 'Requête illisible.');
  }
  const courriel = nettoyer(corps.courriel, LONGUEURS.courriel).toLowerCase();
  if (!COURRIEL.test(courriel)) {
    return refus(400, 'Adresse électronique invalide.');
  }
  if (corps.consentement !== true) {
    return refus(400, 'Le consentement est obligatoire pour s\'abonner.', 'EXG-32');
  }
  const theme = THEMES.includes(corps.theme) ? corps.theme : 'Les deux';
  return { valide: true, donnees: { courriel, theme, consentement: true } };
}

function validerJeton(corps) {
  if (!corps || typeof corps !== 'object') {
    return refus(400, 'Requête illisible.');
  }
  const jeton = nettoyer(corps.jeton, LONGUEURS.jeton);
  if (!/^[A-Za-z0-9-]{8,}$/.test(jeton)) {
    return refus(400, 'Jeton invalide.');
  }
  return { valide: true, donnees: { jeton } };
}

module.exports = {
  REFERENCE,
  THEMES,
  LONGUEURS,
  nettoyer,
  nettoyerNomFichier,
  extensionDe,
  tailleBase64,
  validerCandidature,
  verifierRecevabilite,
  validerAbonnement,
  validerJeton
};
