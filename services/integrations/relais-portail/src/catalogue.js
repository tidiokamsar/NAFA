/* =================================================================
   Relais du portail AGEROUTE — lecture du catalogue publié

   Le fichier data/opportunites.json produit par la couche de
   publication (02-export-publication.ps1) sert à vérifier, avant
   tout relais, que l'offre visée existe et est toujours ouverte
   (EXG-26). Ce contrôle double celui de WF-05 : il évite de faire
   remonter jusqu'à Power Automate des dépôts voués au refus.

   SOURCE_CATALOGUE accepte une URL (https://…/data/opportunites.json)
   ou un chemin de fichier local.
   ================================================================= */
'use strict';

const fs = require('node:fs/promises');

class Catalogue {
  constructor(options, dependances = {}) {
    this.source = options.source;
    this.dureeCacheMs = options.dureeCacheMs;
    this.obligatoire = options.obligatoire;
    this.fetch = dependances.fetch || globalThis.fetch;
    this.lireFichier = dependances.lireFichier || ((chemin) => fs.readFile(chemin, 'utf8'));
    this.cache = null;
    this.chargeLe = 0;
  }

  get configure() {
    return Boolean(this.source);
  }

  async charger(maintenant = Date.now()) {
    if (!this.configure) return null;
    if (this.cache && maintenant - this.chargeLe < this.dureeCacheMs) {
      return this.cache;
    }

    let brut;
    if (/^https?:\/\//i.test(this.source)) {
      const reponse = await this.fetch(this.source, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      if (!reponse.ok) throw new Error('catalogue HTTP ' + reponse.status);
      brut = await reponse.text();
    } else {
      brut = await this.lireFichier(this.source);
    }

    const donnees = JSON.parse(brut);
    this.cache = donnees;
    this.chargeLe = maintenant;
    return donnees;
  }

  /**
   * Recherche une offre par référence dans les recrutements puis
   * les appels d'offres.
   * @returns {Promise<{disponible: boolean, offre: object|null}>}
   */
  async trouverOffre(reference, maintenant = Date.now()) {
    if (!this.configure) {
      return { disponible: false, offre: null };
    }
    let donnees;
    try {
      donnees = await this.charger(maintenant);
    } catch (erreur) {
      /* Catalogue injoignable : selon CATALOGUE_OBLIGATOIRE, on
         bloque le dépôt ou on laisse WF-05 trancher. */
      return { disponible: false, offre: null, erreur };
    }

    const collections = [donnees.recrutements, donnees.appelsOffres];
    for (const collection of collections) {
      if (!Array.isArray(collection)) continue;
      const trouvee = collection.find((o) => o && o.ref === reference);
      if (trouvee) return { disponible: true, offre: trouvee };
    }
    return { disponible: true, offre: null };
  }

  invalider() {
    this.cache = null;
    this.chargeLe = 0;
  }
}

module.exports = { Catalogue };
