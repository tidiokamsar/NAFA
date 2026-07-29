/* =================================================================
   Relais du portail AGEROUTE — limitation de débit

   Fenêtre glissante en mémoire, par adresse IP et par usage.
   Suffisant pour une instance unique derrière le serveur web de
   l'Agence ; en cas de montée en charge multi-instances, remplacer
   l'implémentation par un compteur partagé (Redis) sans changer
   l'interface.
   ================================================================= */
'use strict';

class Limiteur {
  /**
   * @param {number} maximum  nombre d'événements autorisés
   * @param {number} fenetreMs durée de la fenêtre glissante
   */
  constructor(maximum, fenetreMs) {
    this.maximum = maximum;
    this.fenetreMs = fenetreMs;
    this.evenements = new Map(); // clé -> tableau d'horodatages
  }

  /** Consomme un jeton. Renvoie { autorise, resteSecondes }. */
  consommer(cle, maintenant = Date.now()) {
    const debut = maintenant - this.fenetreMs;
    const historique = (this.evenements.get(cle) || []).filter((t) => t > debut);

    if (historique.length >= this.maximum) {
      this.evenements.set(cle, historique);
      const plusAncien = historique[0];
      return {
        autorise: false,
        resteSecondes: Math.max(1, Math.ceil((plusAncien + this.fenetreMs - maintenant) / 1000))
      };
    }

    historique.push(maintenant);
    this.evenements.set(cle, historique);
    return { autorise: true, resteSecondes: 0 };
  }

  /** Purge les clés dont tous les événements sont expirés. */
  nettoyer(maintenant = Date.now()) {
    const debut = maintenant - this.fenetreMs;
    for (const [cle, historique] of this.evenements) {
      const restants = historique.filter((t) => t > debut);
      if (restants.length === 0) this.evenements.delete(cle);
      else this.evenements.set(cle, restants);
    }
  }

  get taille() {
    return this.evenements.size;
  }
}

/* L'adresse d'origine ne peut être lue dans X-Forwarded-For que si
   le service est effectivement derrière un proxy maîtrisé : sinon
   n'importe quel client pourrait forger l'en-tête et contourner la
   limitation. */
function adresseClient(requete, proxyDeConfiance) {
  if (proxyDeConfiance) {
    const transmise = requete.headers['x-forwarded-for'];
    if (transmise) {
      const premiere = String(transmise).split(',')[0].trim();
      if (premiere) return premiere;
    }
  }
  return requete.socket && requete.socket.remoteAddress
    ? requete.socket.remoteAddress
    : 'inconnue';
}

module.exports = { Limiteur, adresseClient };
