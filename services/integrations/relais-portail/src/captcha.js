/* =================================================================
   Relais du portail AGEROUTE — vérification du CAPTCHA

   Le jeton produit par le widget côté client est vérifié ici, puis
   jeté : il n'est jamais transmis à Power Automate.

   Fournisseurs pris en charge : Cloudflare Turnstile, Google
   reCAPTCHA v2/v3, hCaptcha. « aucun » désactive le contrôle — à
   réserver aux environnements de recette.
   ================================================================= */
'use strict';

const POINTS_DE_VERIFICATION = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://hcaptcha.com/siteverify'
};

/**
 * @returns {Promise<{valide: boolean, motif?: string}>}
 */
async function verifierCaptcha(jeton, options, dependances = {}) {
  const { fournisseur, secret, delaiMs } = options;
  const recuperer = dependances.fetch || globalThis.fetch;

  if (fournisseur === 'aucun') {
    return { valide: true, motif: 'controle-desactive' };
  }
  if (!jeton || typeof jeton !== 'string') {
    return { valide: false, motif: 'jeton-absent' };
  }

  const url = POINTS_DE_VERIFICATION[fournisseur];
  if (!url) {
    return { valide: false, motif: 'fournisseur-inconnu' };
  }

  const corps = new URLSearchParams({ secret, response: jeton });
  const arret = AbortSignal.timeout(delaiMs);

  let reponse;
  try {
    reponse = await recuperer(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps.toString(),
      signal: arret
    });
  } catch (erreur) {
    /* Le service de vérification est injoignable. On refuse : un
       dépôt non vérifié vaut moins qu'un dépôt différé. */
    return { valide: false, motif: 'verification-injoignable' };
  }

  if (!reponse.ok) {
    return { valide: false, motif: 'verification-http-' + reponse.status };
  }

  let resultat;
  try {
    resultat = await reponse.json();
  } catch (erreur) {
    return { valide: false, motif: 'reponse-illisible' };
  }

  if (resultat && resultat.success === true) {
    return { valide: true };
  }
  const codes = Array.isArray(resultat && resultat['error-codes'])
    ? resultat['error-codes'].join(',')
    : 'refus';
  return { valide: false, motif: codes };
}

module.exports = { verifierCaptcha, POINTS_DE_VERIFICATION };
