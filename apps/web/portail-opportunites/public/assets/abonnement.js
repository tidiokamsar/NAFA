/* =================================================================
   AGEROUTE Guinée — Confirmation et désabonnement (WF-08, flux B/C)

   Page appelée depuis les liens contenus dans les courriels :
     confirmer.html?jeton=…        → confirmation du double opt-in
     desabonnement.html?jeton=…    → désabonnement (EXG-33)

   Le jeton n'est jamais interprété côté client : il est transmis
   tel quel au relais, qui appelle le flux Power Automate.
   ================================================================= */
(function () {
  'use strict';

  var CONFIG = window.PORTAIL_CONFIG || {};
  var racine = document.getElementById('resultat');
  var action = racine.dataset.action; // 'confirmer' | 'desabonnement'

  var TEXTES = {
    confirmer: {
      attente: 'Confirmation de votre abonnement en cours…',
      succes: 'Votre abonnement est confirmé. Vous recevrez les prochaines publications de ' +
              'l\'AGEROUTE à cette adresse.',
      echec: 'Ce lien de confirmation est invalide ou a déjà été utilisé.'
    },
    desabonnement: {
      attente: 'Traitement de votre désabonnement…',
      succes: 'Vous êtes désabonné. Vous ne recevrez plus de message de la part du portail.',
      echec: 'Ce lien de désabonnement est invalide ou a déjà été utilisé.'
    }
  };

  function afficher(titre, message, genre) {
    document.getElementById('titre').textContent = titre;
    var p = document.getElementById('message');
    p.textContent = message;
    p.className = 'message visible ' + genre;
  }

  function traiter() {
    var textes = TEXTES[action];
    var jeton = new URLSearchParams(window.location.search).get('jeton');

    if (!jeton) {
      afficher('Lien incomplet', 'Le lien utilisé ne contient pas de jeton. Ouvrez-le ' +
        'directement depuis le courriel reçu.', 'erreur');
      return;
    }
    if (!CONFIG.pointEntreeAbonnements) {
      afficher('Service indisponible', 'La gestion des abonnements n\'est pas configurée sur ' +
        'ce site. Contactez contact@ageroute.gov.gn.', 'erreur');
      return;
    }

    afficher('Un instant…', textes.attente, 'info');

    fetch(CONFIG.pointEntreeAbonnements + '/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: jeton })
    }).then(function (reponse) {
      return reponse.json().catch(function () { return {}; }).then(function (corps) {
        if (!reponse.ok) throw new Error(corps.message || textes.echec);
        return corps;
      });
    }).then(function () {
      afficher(action === 'confirmer' ? 'Abonnement confirmé' : 'Désabonnement effectué',
        textes.succes, 'succes');
    }).catch(function (erreur) {
      afficher('Opération impossible', erreur.message || textes.echec, 'erreur');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', traiter);
  } else {
    traiter();
  }
})();
