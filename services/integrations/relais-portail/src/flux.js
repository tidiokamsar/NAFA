/* =================================================================
   Relais du portail AGEROUTE — appel des flux Power Automate

   Les URL des déclencheurs HTTP (WF-05, WF-08 A/B/C) sont des
   secrets d'exploitation : elles ne quittent jamais ce service.
   Chaque appel porte la clé partagée, que le flux contrôle en
   première condition avant tout traitement.
   ================================================================= */
'use strict';

class ErreurFlux extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'ErreurFlux';
    this.code = code;
    this.details = details || null;
  }
}

/**
 * Relaie une charge utile vers un déclencheur Power Automate.
 * @returns {Promise<object>} corps de réponse du flux (JSON ou {})
 */
async function appelerFlux(url, charge, options, dependances = {}) {
  const recuperer = dependances.fetch || globalThis.fetch;

  if (!url) {
    throw new ErreurFlux('Ce service n\'est pas configuré.', 503, 'url-absente');
  }

  const entetes = { 'Content-Type': 'application/json' };
  if (options.clePartagee) {
    entetes[options.entetesCle] = options.clePartagee;
  }

  let reponse;
  try {
    reponse = await recuperer(url, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify(charge),
      signal: AbortSignal.timeout(options.delaiFluxMs)
    });
  } catch (erreur) {
    throw new ErreurFlux(
      'Le service de traitement est momentanément indisponible. Réessayez dans quelques minutes.',
      502,
      erreur.name === 'TimeoutError' ? 'delai-depasse' : 'injoignable'
    );
  }

  const texte = await reponse.text().catch(() => '');
  let corps = {};
  if (texte) {
    try {
      corps = JSON.parse(texte);
    } catch (erreur) {
      corps = {};
    }
  }

  if (!reponse.ok) {
    /* Un refus métier du flux (400/409) doit remonter tel quel au
       candidat ; les erreurs internes sont masquées. */
    const codeSortie = reponse.status >= 400 && reponse.status < 500 ? reponse.status : 502;
    const message = corps && typeof corps.message === 'string'
      ? corps.message
      : codeSortie === 502
        ? 'Le service de traitement a rencontré une erreur. Réessayez plus tard.'
        : 'Le dépôt a été refusé.';
    throw new ErreurFlux(message, codeSortie, 'flux-' + reponse.status);
  }

  return corps;
}

module.exports = { appelerFlux, ErreurFlux };
