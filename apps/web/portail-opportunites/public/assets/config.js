/* =================================================================
   AGEROUTE Guinée — Portail public des opportunités
   CONFIGURATION DE DÉPLOIEMENT

   Seul fichier à adapter lors d'une mise en production. Il ne doit
   contenir AUCUN secret : les URL des déclencheurs Power Automate
   (WF-05, WF-08) restent côté serveur, dans le relais sécurisé
   (services/integrations/relais-portail). Le front n'appelle que
   le relais, hébergé sur le même domaine.
   ================================================================= */

window.PORTAIL_CONFIG = {
  /* Fichier produit par la couche de publication (script 02). */
  sourceDonnees: 'data/opportunites.json',

  /* Points d'entrée du relais sécurisé. Chemins relatifs =
     même origine que le site, donc aucune configuration CORS.
     Laisser une chaîne vide désactive proprement la fonction
     correspondante (le bouton est masqué, rien n'échoue). */
  pointEntreeCandidatures: '/api/candidatures',
  pointEntreeAbonnements: '/api/abonnements',

  /* Racine des documents publics copiés par le script 02.
     Les chemins du JSON sont relatifs à cette racine lorsqu'ils
     ne sont pas absolus. */
  racineDocuments: '',

  /* Contraintes de dépôt — doivent rester alignées sur celles du
     relais et du flux WF-05 (EXG-22). Le contrôle client est un
     confort d'usage ; le contrôle serveur fait foi. */
  extensionsAutorisees: ['pdf', 'docx', 'jpg', 'jpeg', 'png'],
  tailleMaxFichierMo: 10,
  tailleMaxTotalMo: 30,

  /* Clé publique du CAPTCHA (Cloudflare Turnstile par défaut).
     Laisser vide pour désactiver le widget côté client : le relais
     refusera alors les dépôts si la vérification y est exigée. */
  cleCaptcha: '',

  /* Délai au-delà duquel les données publiées sont signalées comme
     potentiellement obsolètes (contrôle de cohérence, CDC §9.2). */
  seuilObsolescenceHeures: 6
};
