/* =================================================================
   AGEROUTE Guinée — Portail public des opportunités
   Logique du site public.

   Les données proviennent de data/opportunites.json, généré par la
   couche de publication (02-export-publication.ps1, déclenché par
   WF-07). Les dépôts de candidature et les abonnements passent par
   le relais sécurisé, jamais directement par Power Automate : les
   URL des déclencheurs sont des secrets d'exploitation (CDC §7.3).

   Aucun gestionnaire d'événement en ligne : le site fonctionne sous
   une CSP stricte, sans 'unsafe-inline'.
   ================================================================= */
(function () {
  'use strict';

  var CONFIG = window.PORTAIL_CONFIG || {};
  var MAINTENANT = new Date();

  var LIBELLES = {
    ouvert: 'Ouvert',
    bientot: 'Clôture proche',
    cloture: 'Clôturé',
    attribue: 'Attribué'
  };

  var etat = {
    ongletActif: 'ao',
    appelsOffres: [],
    recrutements: [],
    genereLe: null,
    modeDemonstration: true
  };

  /* ============================================================
     Utilitaires
     ============================================================ */

  function $(sel, racine) {
    return (racine || document).querySelector(sel);
  }
  function $$(sel, racine) {
    return Array.prototype.slice.call((racine || document).querySelectorAll(sel));
  }

  /* Les libellés viennent de SharePoint : ils sont saisis par des
     agents, pas par le public, mais ils traversent quand même une
     insertion HTML. On les échappe systématiquement. */
  function echapper(valeur) {
    if (valeur === null || valeur === undefined) return '';
    return String(valeur)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function joursRestants(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d - MAINTENANT) / 86400000);
  }

  function formatDate(d) {
    var date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatDateHeure(d) {
    var date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  /* Statut d'affichage : le statut SharePoint fait autorité, la date
     de clôture ne sert qu'à distinguer « ouvert » de « clôture
     proche » et à couvrir le délai entre la clôture réelle et le
     passage de WF-04 (00h15). */
  function statutDe(item) {
    var brut = item.statut || 'Publié';
    if (brut === 'Attribué') return 'attribue';
    if (brut === 'Clôturé' || brut === 'Archivé' || brut === 'Résultats publiés') return 'cloture';
    var j = joursRestants(item.cloture);
    if (j === null) return 'ouvert';
    if (j < 0) return 'cloture';
    if (j <= 7) return 'bientot';
    return 'ouvert';
  }

  function estOuvert(item) {
    var st = statutDe(item);
    return st === 'ouvert' || st === 'bientot';
  }

  function resoudreDocument(chemin) {
    if (!chemin) return null;
    if (/^(https?:)?\/\//.test(chemin) || chemin.charAt(0) === '/') return chemin;
    var racine = CONFIG.racineDocuments || '';
    if (racine && racine.charAt(racine.length - 1) !== '/') racine += '/';
    return racine + chemin;
  }

  /* ============================================================
     Rendu des cartes
     ============================================================ */

  function carteHTML(item, type) {
    var st = statutDe(item);
    var j = joursRestants(item.cloture);
    var compte = (st === 'ouvert' || st === 'bientot') && j !== null
      ? '<span class="compte ' + (j > 7 ? 'large' : '') + '">J−' + j + '</span>'
      : '';

    var puces = type === 'ao'
      ? '<span class="puce">' + echapper(item.region) + '</span>' +
        '<span class="puce neutre">' + echapper(item.bailleur) + '</span>'
      : '<span class="puce">' + echapper(item.type) + '</span>' +
        '<span class="puce neutre">' + echapper(item.direction) + '</span>' +
        '<span class="puce neutre">' + echapper(item.lieu) + '</span>';

    var doc = type === 'ao' ? resoudreDocument(item.dao) : resoudreDocument(item.tdr);
    var libelleDoc = type === 'ao' ? '📄 Télécharger le DAO' : '📄 Télécharger les TDR';
    var boutonDoc = doc
      ? '<a class="bouton bleu" href="' + echapper(doc) + '" download>' + libelleDoc + '</a>'
      : '<button class="bouton bleu" type="button" disabled title="Document non encore publié">' +
        libelleDoc + '</button>';

    var boutonSecondaire;
    if (type === 'rh' && estOuvert(item) && CONFIG.pointEntreeCandidatures) {
      boutonSecondaire = '<button class="bouton rouge" type="button" data-action="postuler" ' +
        'data-ref="' + echapper(item.ref) + '">📝 Postuler</button>';
    } else {
      var libelle = (type === 'rh' && !estOuvert(item)) ? 'Voir les résultats' : 'Voir les détails';
      boutonSecondaire = '<button class="bouton contour" type="button" data-action="details" ' +
        'data-ref="' + echapper(item.ref) + '" data-type="' + type + '">' + libelle + '</button>';
    }

    return '<article class="carte" data-statut="' + st + '">' +
      '<div class="ref">' + echapper(item.ref) + '</div>' +
      '<h3>' + echapper(item.titre) + '</h3>' +
      '<div class="meta">' + puces + '</div>' +
      '<div class="dates">' +
        '<div>Publication<b>' + formatDate(item.pub) + '</b></div>' +
        '<div>Clôture<b>' + formatDate(item.cloture) + '</b></div>' +
      '</div>' +
      '<div class="rangee-statut">' +
        '<span class="statut ' + st + '">' + LIBELLES[st] + '</span>' + compte +
      '</div>' +
      '<div class="actions">' + boutonDoc + boutonSecondaire + '</div>' +
    '</article>';
  }

  function filtrer() {
    var q = $('#q').value.toLowerCase().trim();
    var region = $('#f-region').value;
    var bailleur = $('#f-bailleur').value;
    var statut = $('#f-statut').value;
    var source = etat.ongletActif === 'ao' ? etat.appelsOffres : etat.recrutements;

    var resultats = source.filter(function (it) {
      var texte = [it.ref, it.titre, it.desc, it.region, it.bailleur, it.direction, it.lieu]
        .filter(Boolean).join(' ').toLowerCase();
      if (q && texte.indexOf(q) === -1) return false;
      if (region && it.region !== region && it.lieu !== region) return false;
      if (bailleur && it.bailleur !== bailleur && it.direction !== bailleur) return false;
      if (statut && statutDe(it) !== statut) return false;
      return true;
    });

    var zone = $('#liste-cartes');
    zone.innerHTML = resultats.length
      ? resultats.map(function (it) { return carteHTML(it, etat.ongletActif); }).join('')
      : '<div class="vide"><b>Aucun résultat</b><br>Modifiez vos critères de recherche ' +
        'ou consultez les archives.</div>';
    $('#compte-resultats').textContent = resultats.length + ' résultat' +
      (resultats.length > 1 ? 's' : '');
  }

  function montrerOnglet(t) {
    etat.ongletActif = t;
    $('#tab-ao').setAttribute('aria-selected', String(t === 'ao'));
    $('#tab-rh').setAttribute('aria-selected', String(t === 'rh'));
    filtrer();
  }

  /* Les « actualités » sont dérivées des publications réelles :
     aucune rédaction manuelle à maintenir, et rien qui puisse
     rester affiché après le retrait d'un avis. */
  function rendreActualites() {
    var tout = etat.appelsOffres.map(function (x) { return { item: x, type: 'ao' }; })
      .concat(etat.recrutements.map(function (x) { return { item: x, type: 'rh' }; }));

    var recentes = tout
      .filter(function (e) { return e.item.pub; })
      .sort(function (a, b) { return new Date(b.item.pub) - new Date(a.item.pub); })
      .slice(0, 3);

    var zone = $('#liste-actus');
    if (!recentes.length) {
      zone.innerHTML = '<div class="vide">Aucune publication récente.</div>';
      return;
    }

    zone.innerHTML = recentes.map(function (e) {
      var st = statutDe(e.item);
      var chapeau = st === 'attribue' ? 'Attribution du marché'
        : st === 'cloture' ? (e.type === 'rh' ? 'Recrutement clôturé' : 'Consultation clôturée')
        : (e.type === 'ao' ? 'Nouvel avis de marché' : 'Nouvelle offre d\'emploi');
      return '<article class="actu">' +
        '<time datetime="' + echapper(e.item.pub) + '">' + formatDate(e.item.pub) + '</time>' +
        '<h3>' + echapper(chapeau) + ' — ' + echapper(e.item.ref) + '</h3>' +
        '<p>' + echapper(e.item.titre) + '</p>' +
      '</article>';
    }).join('');
  }

  function trouver(ref, type) {
    var source = type === 'ao' ? etat.appelsOffres : etat.recrutements;
    return source.filter(function (x) { return x.ref === ref; })[0] || null;
  }

  /* ============================================================
     Fenêtre de détails
     ============================================================ */

  function voirDetails(ref, type) {
    var it = trouver(ref, type);
    if (!it) return;

    $('#dlg-titre').textContent = it.titre;
    var infos = type === 'ao'
      ? [['Référence', it.ref], ['Type de marché', it.type], ['Région', it.region],
         ['Bailleur', it.bailleur], ['Publication', formatDate(it.pub)],
         ['Clôture', formatDateHeure(it.cloture)], ['Statut', LIBELLES[statutDe(it)]]]
      : [['Référence', it.ref], ['Type de contrat', it.type], ['Direction', it.direction],
         ['Lieu', it.lieu], ['Publication', formatDate(it.pub)],
         ['Date limite', formatDateHeure(it.cloture)], ['Statut', LIBELLES[statutDe(it)]]];

    $('#dlg-infos').innerHTML = infos.map(function (paire) {
      return '<dt>' + echapper(paire[0]) + '</dt><dd>' + echapper(paire[1] || '—') + '</dd>';
    }).join('');
    $('#dlg-desc').textContent = it.desc || '';

    var actions = [];
    if (type === 'ao') {
      var dao = resoudreDocument(it.dao);
      if (dao) actions.push('<a class="bouton bleu" href="' + echapper(dao) + '" download>📄 Télécharger le DAO</a>');
      var resultat = resoudreDocument(it.resultat);
      if (resultat) actions.push('<a class="bouton contour" href="' + echapper(resultat) + '" download>📄 Avis d\'attribution</a>');
    } else {
      var tdr = resoudreDocument(it.tdr);
      if (tdr) actions.push('<a class="bouton contour" href="' + echapper(tdr) + '" download>📄 Télécharger les TDR</a>');
      if (estOuvert(it) && CONFIG.pointEntreeCandidatures) {
        actions.push('<button class="bouton rouge" type="button" data-action="postuler" ' +
          'data-ref="' + echapper(it.ref) + '">📝 Déposer ma candidature</button>');
      }
    }
    if (!actions.length) {
      actions.push('<p class="aide">Aucun document n\'est disponible au téléchargement pour cette publication.</p>');
    }
    $('#dlg-actions').innerHTML = actions.join('');
    $('#dlg').showModal();
  }

  /* ============================================================
     Dépôt de candidature (EXG-22, EXG-23, EXG-24)
     ============================================================ */

  var candidature = { offre: null, pieces: [] };

  function extensionDe(nom) {
    var pos = nom.lastIndexOf('.');
    return pos === -1 ? '' : nom.slice(pos + 1).toLowerCase();
  }

  function mo(octets) {
    return Math.round((octets / 1048576) * 10) / 10;
  }

  function validerPieces(fichiers) {
    var extensions = CONFIG.extensionsAutorisees || ['pdf', 'docx', 'jpg', 'jpeg', 'png'];
    var maxFichier = (CONFIG.tailleMaxFichierMo || 10) * 1048576;
    var maxTotal = (CONFIG.tailleMaxTotalMo || 30) * 1048576;
    var total = 0;
    var rapport = [];

    fichiers.forEach(function (f) {
      var erreur = null;
      if (extensions.indexOf(extensionDe(f.name)) === -1) {
        erreur = 'format non autorisé';
      } else if (f.size > maxFichier) {
        erreur = 'dépasse ' + (CONFIG.tailleMaxFichierMo || 10) + ' Mo';
      }
      total += f.size;
      rapport.push({ fichier: f, erreur: erreur });
    });

    var erreurGlobale = null;
    if (!fichiers.length) {
      erreurGlobale = 'Joignez au moins une pièce (CV, lettre de motivation, diplômes).';
    } else if (total > maxTotal) {
      erreurGlobale = 'Le total des pièces (' + mo(total) + ' Mo) dépasse la limite de ' +
        (CONFIG.tailleMaxTotalMo || 30) + ' Mo.';
    } else if (rapport.some(function (r) { return r.erreur; })) {
      erreurGlobale = 'Certaines pièces ne respectent pas les formats ou les tailles autorisés.';
    }
    return { rapport: rapport, total: total, erreur: erreurGlobale };
  }

  function afficherPieces() {
    var fichiers = Array.prototype.slice.call($('#cand-pieces').files);
    var v = validerPieces(fichiers);
    $('#cand-liste-pieces').innerHTML = v.rapport.map(function (r) {
      return '<li class="' + (r.erreur ? 'invalide' : '') + '">' +
        '<span>' + echapper(r.fichier.name) + '</span>' +
        '<span>' + mo(r.fichier.size) + ' Mo' + (r.erreur ? ' — ' + r.erreur : '') + '</span></li>';
    }).join('');
    $('#cand-total').textContent = fichiers.length
      ? 'Total : ' + mo(v.total) + ' Mo / ' + (CONFIG.tailleMaxTotalMo || 30) + ' Mo'
      : '';
  }

  function lireBase64(fichier) {
    return new Promise(function (resolve, reject) {
      var lecteur = new FileReader();
      lecteur.onerror = function () { reject(new Error('Lecture impossible : ' + fichier.name)); };
      lecteur.onload = function () {
        var resultat = String(lecteur.result);
        var virgule = resultat.indexOf(',');
        resolve(virgule === -1 ? resultat : resultat.slice(virgule + 1));
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  function ouvrirCandidature(ref) {
    var offre = trouver(ref, 'rh');
    if (!offre) return;
    if (!estOuvert(offre)) {
      /* Garde-fou d'affichage ; le refus qui fait foi est celui du
         relais et du flux WF-05 (EXG-26). */
      alert('Cette offre est clôturée : les candidatures ne sont plus recevables.');
      return;
    }
    candidature.offre = offre;
    $('#cand-titre').textContent = 'Candidature — ' + offre.titre;
    $('#cand-offre').textContent = offre.ref + ' · clôture le ' + formatDateHeure(offre.cloture);
    $('#cand-formulaire').reset();
    $('#cand-formulaire').hidden = false;
    $('#cand-liste-pieces').innerHTML = '';
    $('#cand-total').textContent = '';
    $('#cand-recu').hidden = true;
    masquerMessage('#cand-message');
    $('#cand-dialogue').showModal();
  }

  function montrerMessage(selecteur, texte, genre) {
    var el = $(selecteur);
    el.textContent = texte;
    el.className = 'message visible ' + (genre || 'info');
  }
  function masquerMessage(selecteur) {
    var el = $(selecteur);
    el.textContent = '';
    el.className = 'message';
  }

  function jetonCaptcha(formulaire) {
    var champ = formulaire.querySelector('[name="cf-turnstile-response"], [name="g-recaptcha-response"], [name="h-captcha-response"]');
    return champ ? champ.value : '';
  }

  function envoyerCandidature(evenement) {
    evenement.preventDefault();
    if (!candidature.offre) return;

    var formulaire = evenement.target;
    var fichiers = Array.prototype.slice.call($('#cand-pieces').files);
    var v = validerPieces(fichiers);
    if (v.erreur) {
      montrerMessage('#cand-message', v.erreur, 'erreur');
      return;
    }
    if (!$('#cand-consentement').checked) {
      montrerMessage('#cand-message', 'Le consentement au traitement des données est obligatoire.', 'erreur');
      return;
    }

    var bouton = $('#cand-envoyer');
    bouton.disabled = true;
    bouton.textContent = 'Envoi en cours…';
    montrerMessage('#cand-message', 'Transmission du dossier, merci de patienter…', 'info');

    Promise.all(fichiers.map(function (f) {
      return lireBase64(f).then(function (contenu) {
        return { nom: f.name, contenuBase64: contenu };
      });
    })).then(function (pieces) {
      return fetch(CONFIG.pointEntreeCandidatures, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offreRef: candidature.offre.ref,
          nom: $('#cand-nom').value.trim(),
          prenom: $('#cand-prenom').value.trim(),
          courriel: $('#cand-courriel').value.trim(),
          telephone: $('#cand-telephone').value.trim(),
          consentement: true,
          captcha: jetonCaptcha(formulaire),
          pieces: pieces
        })
      });
    }).then(function (reponse) {
      return reponse.json().catch(function () { return {}; }).then(function (corps) {
        if (!reponse.ok) {
          throw new Error(corps.message || 'Le dépôt a été refusé (code ' + reponse.status + ').');
        }
        return corps;
      });
    }).then(function (corps) {
      masquerMessage('#cand-message');
      $('#cand-formulaire').hidden = true;
      $('#cand-numero').textContent = corps.dossier || '—';
      $('#cand-recu').hidden = false;
    }).catch(function (erreur) {
      montrerMessage('#cand-message', erreur.message ||
        'Le dépôt a échoué. Réessayez dans quelques instants.', 'erreur');
    }).then(function () {
      bouton.disabled = false;
      bouton.textContent = 'Déposer ma candidature';
    });
  }

  /* ============================================================
     Abonnement (double opt-in — WF-08, EXG-32/33)
     ============================================================ */

  function envoyerAbonnement(evenement) {
    evenement.preventDefault();
    var formulaire = evenement.target;
    var bouton = $('#abo-envoyer');
    var retour = $('#abo-retour');

    if (!$('#abo-consentement').checked) {
      retour.textContent = 'Cochez la case de consentement pour vous abonner.';
      retour.className = 'retour erreur';
      return;
    }

    bouton.disabled = true;
    retour.textContent = 'Envoi en cours…';
    retour.className = 'retour';

    fetch(CONFIG.pointEntreeAbonnements, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courriel: $('#abo-courriel').value.trim(),
        theme: $('#abo-theme').value,
        consentement: true,
        captcha: jetonCaptcha(formulaire)
      })
    }).then(function (reponse) {
      return reponse.json().catch(function () { return {}; }).then(function (corps) {
        if (!reponse.ok) throw new Error(corps.message || 'Inscription refusée.');
        return corps;
      });
    }).then(function () {
      retour.textContent = 'Un courriel de confirmation vient de vous être envoyé. ' +
        'Votre abonnement sera actif dès que vous aurez cliqué sur le lien qu\'il contient.';
      retour.className = 'retour succes';
      formulaire.reset();
    }).catch(function (erreur) {
      retour.textContent = erreur.message || 'L\'inscription a échoué. Réessayez plus tard.';
      retour.className = 'retour erreur';
    }).then(function () {
      bouton.disabled = false;
    });
  }

  /* ============================================================
     Chargement des données publiées
     ============================================================ */

  function normaliserAO(x) {
    return {
      ref: x.ref, titre: x.titre, desc: x.desc || '',
      type: x.type || '—', region: x.region || 'National', bailleur: x.bailleur || '—',
      pub: x.pub, cloture: x.cloture, statut: x.statut || 'Publié',
      dao: x.dao || null, resultat: x.resultat || null
    };
  }

  function normaliserRH(x) {
    return {
      ref: x.ref, titre: x.titre, desc: x.desc || '',
      type: x.type || '—', direction: x.direction || '—', lieu: x.lieu || '—',
      pub: x.pub, cloture: x.cloture, statut: x.statut || 'Publié',
      tdr: x.tdr || null
    };
  }

  function appliquerStats(s) {
    var cibles = [s.aoOuverts, s.rhOuverts, s.daoDisponibles,
                  s.cloturesSemaine, s.marchesAttribues, s.recrutTermines];
    $$('.borne .valeur').forEach(function (el, i) {
      if (typeof cibles[i] === 'number') el.dataset.cible = cibles[i];
    });
  }

  function animerBornes() {
    var reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $$('.borne .valeur').forEach(function (el) {
      var cible = Number(el.dataset.cible) || 0;
      if (reduit) { el.textContent = cible; return; }
      var v = 0;
      var pas = Math.max(1, Math.round(cible / 30));
      var t = setInterval(function () {
        v = Math.min(cible, v + pas);
        el.textContent = v;
        if (v >= cible) clearInterval(t);
      }, 30);
    });
  }

  /* Contrôle de fraîcheur : si la couche de publication est en
     panne, le public doit le savoir (CDC §9.2). */
  function verifierFraicheur() {
    var bandeau = $('#bandeau-sync');
    if (etat.modeDemonstration) {
      bandeau.textContent = 'Données de démonstration : la synchronisation avec le back-office ' +
        'n\'a pas encore été exécutée. Ces publications ne font pas foi.';
      bandeau.classList.add('visible');
      return;
    }
    if (!etat.genereLe) return;
    var age = (MAINTENANT - new Date(etat.genereLe)) / 3600000;
    var seuil = CONFIG.seuilObsolescenceHeures || 6;
    if (age > seuil) {
      bandeau.textContent = 'Dernière mise à jour le ' + formatDateHeure(etat.genereLe) +
        '. Les informations affichées peuvent ne pas refléter les toutes dernières publications.';
      bandeau.classList.add('visible');
    }
    $('#horodatage').textContent = 'Données publiées le ' + formatDateHeure(etat.genereLe);
  }

  function chargerDonnees() {
    return fetch(CONFIG.sourceDonnees, { cache: 'no-store' })
      .then(function (rep) {
        if (!rep.ok) throw new Error('HTTP ' + rep.status);
        return rep.json();
      })
      .then(function (d) {
        etat.appelsOffres = Array.isArray(d.appelsOffres) ? d.appelsOffres.map(normaliserAO) : [];
        etat.recrutements = Array.isArray(d.recrutements) ? d.recrutements.map(normaliserRH) : [];
        if (d.stats) appliquerStats(d.stats);
        etat.genereLe = d.genereLe || null;
        /* Le jeu d'exemple porte un marqueur explicite : il ne doit
           jamais être présenté comme une publication officielle. */
        etat.modeDemonstration = d.exemple === true;
      })
      .catch(function (e) {
        /* Source indisponible : le site reste consultable mais
           annonce clairement qu'il n'affiche pas de données
           officielles. */
        etat.modeDemonstration = true;
        if (window.console) console.warn('Source de données indisponible.', e.message);
      })
      .then(function () {
        montrerOnglet(etat.ongletActif);
        rendreActualites();
        animerBornes();
        verifierFraicheur();
      });
  }

  /* ============================================================
     Câblage des événements (aucun handler en ligne)
     ============================================================ */

  function brancher() {
    $('#burger').addEventListener('click', function () {
      var menu = $('#menu');
      var ouvert = menu.classList.toggle('ouvert');
      this.setAttribute('aria-expanded', String(ouvert));
    });

    $$('[data-onglet]').forEach(function (el) {
      el.addEventListener('click', function () {
        montrerOnglet(el.dataset.onglet);
      });
    });

    ['#q', '#f-region', '#f-bailleur', '#f-statut'].forEach(function (sel) {
      var el = $(sel);
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', filtrer);
    });
    $('#recherche').addEventListener('submit', function (e) { e.preventDefault(); filtrer(); });

    /* Délégation : les cartes sont réécrites à chaque filtrage. */
    document.addEventListener('click', function (e) {
      var cible = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!cible) return;
      var action = cible.dataset.action;
      if (action === 'details') {
        voirDetails(cible.dataset.ref, cible.dataset.type);
      } else if (action === 'postuler') {
        $('#dlg').close();
        ouvrirCandidature(cible.dataset.ref);
      } else if (action === 'fermer') {
        cible.closest('dialog').close();
      }
    });

    $('#cand-pieces').addEventListener('change', afficherPieces);
    $('#cand-formulaire').addEventListener('submit', envoyerCandidature);
    $('#abo-formulaire').addEventListener('submit', envoyerAbonnement);

    if (!CONFIG.pointEntreeAbonnements) {
      $('#bloc-abonnement').hidden = true;
    }
  }

  function demarrer() {
    brancher();
    chargerDonnees();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})();
