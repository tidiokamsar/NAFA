# AGEROUTE Guinée — Construction des flux Power Automate

Réf. cahier des charges v2.0, section 6. Chaque flux est créé dans une **solution Power Platform dédiée** nommée `AGR-PRT-Automatisation`, avec des **connexions portées par le compte de service** `svc-portail@ageroute.gov.gn` (jamais un compte nominatif). Tous les flux incluent un bloc « Étendue — Gestion des erreurs » qui, en cas d'échec, envoie un courriel à `dsi-supervision@ageroute.gov.gn` avec le nom du flux, l'élément concerné et le message d'erreur.

Convention de nommage des flux : `AGR-PRT-WFxx-<intitulé>`.

> **Ce que le code du dépôt fournit déjà.** Les contrôles de format, de taille, de consentement et de clôture décrits ici sont **également** implémentés dans le relais (`services/integrations/relais-portail`), qui refuse la requête avant d'atteindre Power Automate. Les contrôles des flux restent obligatoires : ils constituent la ligne de défense qui s'applique même si le relais est contourné.

---

## WF-01 — Validation et publication d'un avis

> **Feuille de construction détaillée : `CONSTRUCTION-WF-01-PAS-A-PAS.md`.**
> La spécification ci-dessous dit *quoi* ; la feuille dit *comment*, avec les
> expressions exactes et les trois pièges qui coûtent le plus de temps.

**Déclencheur** : SharePoint — *Lorsqu'un élément est créé ou modifié* sur `Liste-AppelsOffres` (dupliquer le flux pour `Liste-Recrutements`).

**Condition d'entrée** (Paramètres du déclencheur → Trigger Condition, évite les boucles) :
```
@equals(triggerOutputs()?['body/StatutAO/Value'], 'En validation')
```

**Étapes** :
1. *Démarrer et attendre une approbation* (type : Approuver/Rejeter — tous doivent approuver)
   - Approbateur 1 : membre du groupe `AGR-PRT-Valideurs` désigné pour la DPMP.
   - Titre : `Validation — @{triggerOutputs()?['body/ReferenceAO']} @{triggerOutputs()?['body/Title']}`
   - Détails : lien vers l'élément, dates, bailleur.
2. **Condition** : résultat = `Approve`
   - **Oui** :
     a. *Mettre à jour l'élément* → `StatutAO = Publié`, `DatePublication = utcNow()` si vide.
     b. *HTTP* → appel du webhook de publication (déclenche le script 02 / pipeline) — voir WF-07.
     c. *Envoyer un courriel (V2)* aux abonnés du thème concerné (voir WF-08 pour la liste).
     d. *Publier une carte Teams* dans le canal `Portail — Publications` (traçabilité interne).
   - **Non** :
     a. `StatutAO = Brouillon`.
     b. Courriel au contributeur avec les commentaires du valideur.

**Test de recette associé** : EXG-41 — aucun contenu ne doit atteindre le statut « Publié » sans une approbation tracée dans l'historique du flux.

---

## WF-02 — Additif

**Déclencheur** : SharePoint — *Lorsqu'un fichier est créé* dans la bibliothèque `Additifs`.

**Étapes** :
1. *Obtenir les propriétés du fichier* ; lire la colonne `ReferenceMarche` (créée par le script 01 sur les bibliothèques `DAO`, `Additifs`, `Attributions`, `AppelsOffres` et `RecrutementTDR` ; format AO/AAAA/NNN).
2. *Obtenir les éléments* de `Liste-AppelsOffres` avec filtre OData : `ReferenceAO eq '<référence>'` (colonne indexée par le script 01).
3. Approbation rapide du valideur DPMP (même modèle que WF-01).
4. Après approbation : *Mettre à jour l'élément* (horodatage `DerniereModification`), appel du webhook de publication, **alerte ciblée** aux abonnés ayant téléchargé ou suivi ce marché.

---

## WF-03 — Alerte de clôture (J-7 / J-2)

**Déclencheur** : *Périodicité* — tous les jours à 06h00 (fuseau : Africa/Conakry).

**Étapes** :
1. *Obtenir les éléments* `Liste-AppelsOffres`, filtre :
   `StatutAO eq 'Publié' and DateCloture le '@{addDays(utcNow(),7)}'`
2. *Appliquer à chacun* :
   - Si `DateCloture` ≤ J+2 → courriel de rappel URGENT au gestionnaire + mention « Clôture imminente ».
   - Sinon → simple rappel J-7.
3. Même logique sur `Liste-Recrutements` (`DateLimite`).
4. Le bandeau « clôture proche » du front public est calculé côté site à partir du JSON — aucune action nécessaire ici.

---

## WF-04 — Clôture et archivage automatiques

> **Feuille de construction détaillée : `CONSTRUCTION-WF-04-PAS-A-PAS.md`.**

**Déclencheur** : *Périodicité* — tous les jours à 00h15.

**Étapes** :
1. AO : filtre `StatutAO eq 'Publié' and DateCloture lt '@{utcNow()}'` → *Mettre à jour* `StatutAO = Clôturé`.
2. RH : filtre équivalent → `StatutRH = Clôturé`. **Effet critique (EXG-26)** : le point d'entrée des candidatures (WF-05) vérifie ce statut côté serveur et rejette tout dépôt sur une offre clôturée, indépendamment de l'affichage.
3. Archivage : filtre `StatutAO eq 'Clôturé' and DateCloture lt '@{addDays(utcNow(),-30)}'` et `GelArchivage ne 1` (colonne booléenne créée par le script 01, levée manuellement en cas de recours ou de contentieux) → `StatutAO = Archivé`, déplacement des documents liés vers `AppelsOffres/Archives`.
4. Appel du webhook de publication pour rafraîchir le front.

> **Fenêtre résiduelle.** Entre l'heure de clôture réelle et l'exécution de 00h15, une offre reste au statut « Publié ». Le relais compare donc **aussi** la date limite à l'heure courante (`verifierRecevabilite`), et WF-05 fait de même : une offre dont l'heure est passée est refusée sans attendre le passage du flux planifié.

---

## WF-05 — Réception d'une candidature (point d'entrée public)

**Déclencheur** : *Lors de la réception d'une requête HTTP* (méthode POST).

> **Feuille de construction détaillée** : `CONSTRUCTION-WF-05-PAS-A-PAS.md` reprend ce flux
> action par action, avec les expressions à recopier et la recette associée.

> ⚠️ L'URL du déclencheur est un **secret d'exploitation** : elle n'apparaît jamais dans le code du front public. Le formulaire public appelle le **relais** (`services/integrations/relais-portail`), qui vérifie le CAPTCHA, applique une limitation de débit, contrôle les pièces et ajoute la clé partagée avant de relayer. Réf. CDC §7.3.

**Première condition du flux — contrôle de la clé partagée** :
```
@equals(triggerOutputs()?['headers']['x-cle-relais'], '<valeur du coffre>')
```
Si la condition est fausse : *Réponse* HTTP 401 puis *Terminer* en échec. Un appel direct au déclencheur, sans passer par le relais, est ainsi inopérant même si son URL fuite.

**Schéma JSON attendu** (produit tel quel par le relais, jeton CAPTCHA retiré) :
```json
{
  "offreRef": "RH/2026/012",
  "nom": "…", "prenom": "…", "courriel": "…", "telephone": "…",
  "consentement": true,
  "pieces": [ { "nom": "CV.pdf", "contenuBase64": "…" } ]
}
```

**Étapes** :
1. **Contrôles serveur** (Condition + Terminer en échec 400 si non conformes) :
   - `consentement` = true — sinon rejet (EXG-23) ;
   - offre existante ET `StatutRH = 'Publié'` ET `DateLimite > utcNow()` — sinon rejet « offre clôturée » (EXG-26) ;
   - pièces : extensions ∈ {pdf, docx, jpg, jpeg, png}, taille unitaire ≤ 10 Mo, total ≤ 30 Mo (EXG-22).
2. *Composer* le numéro de dossier : `CAND-@{formatDateTime(utcNow(),'yyyy')}-@{rand(10000,99999)}` puis vérifier l'unicité dans `Liste-Candidatures` (boucle de régénération si collision). La colonne `NumeroDossier` porte une contrainte d'unicité SharePoint : une collision non détectée fait échouer la création plutôt que de produire deux dossiers homonymes.
3. *Créer un dossier* `Candidatures/<NumeroDossier>` puis *Créer un fichier* pour chaque pièce (base64 → binaire).
4. *Créer un élément* dans `Liste-Candidatures` : identité, `OffreLiee`, `DateDepot = utcNow()`, `ConsentementRGPD = Oui`, `StatutDossier = Reçu`.
5. *Envoyer un courriel (V2)* au candidat : accusé de réception avec le numéro de dossier (EXG-24) — modèle bilingue FR simple, expéditeur `recrutement@ageroute.gov.gn`.
6. *Envoyer un courriel* de notification au groupe RH.
7. *Réponse* HTTP 200 : `{ "dossier": "CAND-2026-12345" }` — affiché au candidat par le front.

**Format des réponses d'erreur.** Le relais retransmet au candidat le corps des réponses 4xx du flux. Renvoyer un objet `{ "message": "…" }` rédigé pour le public ; les réponses 5xx sont masquées derrière un message générique.

**Sécurité complémentaire** : l'analyse antivirus des pièces est assurée par Defender pour Microsoft 365 sur la bibliothèque ; un fichier détecté est mis en quarantaine et le dossier passe à `StatutDossier = Clôturé` avec alerte DSI.

---

## WF-06 — Publication des résultats

**Déclencheur** : modification sur `Liste-AppelsOffres` (`StatutAO = Attribué`) ou `Liste-Recrutements` (`StatutRH = Résultats publiés`), avec condition de déclencheur sur le changement de statut.

**Étapes** : approbation Direction (niveau 2), vérification qu'un document de résultat est bien lié (`LienResultat` non vide — sinon rejet), appel du webhook de publication, notification aux abonnés, et — pour les recrutements, si la procédure le prévoit — courriel individualisé aux candidats du dossier via `Liste-Candidatures` filtrée sur `OffreLiee`.

---

## WF-07 — Synchronisation du front public

**Déclencheur** : *Lors de la réception d'une requête HTTP* (appelé par WF-01/02/04/06) **et** *Périodicité* de secours toutes les heures (deux flux pointant la même action, ou un flux enfant).

**Étapes** :
1. Appel du pipeline de publication : selon l'hébergement retenu, soit démarrage du runbook Azure Automation exécutant `02-export-publication.ps1`, soit déclenchement du pipeline CI/CD qui régénère et déploie le site.
2. *Délai* 3 minutes puis contrôle : HTTP GET `https://opportunites.ageroute.gov.gn/data/opportunites.json` — vérifier que `genereLe` est postérieur au déclenchement.
3. En cas d'échec ou d'incohérence : alerte DSI (P2 — CDC §9.3) et nouvel essai unique.

> Le front affiche de lui-même un bandeau d'avertissement au public dès que `genereLe` dépasse le seuil configuré (`seuilObsolescenceHeures`, 6 h par défaut) : une panne de synchronisation n'est jamais silencieuse pour l'usager.

---

## WF-08 — Gestion des abonnements (double opt-in)

**Liste support** : `Liste-Abonnes`, créée par le script 01 (colonnes `CourrielAbonne` [indexé, unique], `ThemeAbonne` [AO / Recrutement / Les deux], `StatutAbonne` [En attente / Confirmé / Désabonné], `JetonConfirmation` [indexé], `DateInscription`, `DateConsentement`). L'héritage de permissions y est rompu au même titre que sur les candidatures : ce sont des données personnelles.

Les trois flux sont appelés par le relais, jamais directement par le navigateur ; ils contrôlent la clé partagée en première condition, comme WF-05.

**Flux A — Inscription** (`POST` depuis `/api/abonnements`)
Charge utile : `{ "courriel": "…", "theme": "AO|Recrutement|Les deux", "consentement": true }`.
→ Si l'adresse existe déjà avec `StatutAbonne = Confirmé`, répondre 200 sans rien recréer (pas de fuite d'information sur l'existence d'un abonnement).
→ Sinon création ou mise à jour avec `StatutAbonne = En attente` et `JetonConfirmation = guid()`, puis courriel « Confirmez votre abonnement » contenant le lien
`https://opportunites.ageroute.gov.gn/confirmer.html?jeton=@{outputs('Jeton')}`.

**Flux B — Confirmation** (`POST` depuis `/api/abonnements/confirmer`)
Charge utile : `{ "jeton": "…" }`. Recherche sur `JetonConfirmation`, puis `StatutAbonne = Confirmé`, `DateConsentement = utcNow()`, et **effacement du jeton** (usage unique). Jeton inconnu → 400 avec un message neutre.

**Flux C — Désabonnement** (`POST` depuis `/api/abonnements/desabonnement`)
Charge utile : `{ "jeton": "…" }`. Le lien correspondant figure dans **chaque** message envoyé (EXG-33) :
`https://opportunites.ageroute.gov.gn/desabonnement.html?jeton=@{items('Boucle')?['JetonConfirmation']}`
→ `StatutAbonne = Désabonné`.

Les envois de WF-01/02/06 lisent cette liste filtrée sur `StatutAbonne eq 'Confirmé'` et le thème concerné, par lots de 100 destinataires en Cci.

---

## WF-09 — Purge des candidatures (conservation limitée)

Obligation de conservation limitée à 24 mois après clôture du recrutement (CDC §7.2). Ce flux était mentionné en exploitation courante sans spécification : il est décrit ici.

**Déclencheur** : *Périodicité* — le 1er de chaque mois à 01h00 (Africa/Conakry).

**Étapes** :
1. *Obtenir les éléments* `Liste-Recrutements`, filtre :
   `DateLimite lt '@{addDays(utcNow(),-730)}'`
2. *Appliquer à chacun* :
   a. *Obtenir les éléments* `Liste-Candidatures` filtrés sur `OffreLiee` ;
   b. pour chaque dossier : *Supprimer le dossier* `Candidatures/<NumeroDossier>` de la bibliothèque, puis *Supprimer l'élément* de la liste ;
   c. incrémenter un compteur.
3. *Créer un élément* dans un journal de purge (référence de l'offre, nombre de dossiers supprimés, horodatage) — c'est cette trace, et non les dossiers, qui est conservée.
4. Courriel récapitulatif au DPO et à la DSI.

**Précaution** : ne purger que les offres dont `StatutRH` vaut `Clôturé`, `Résultats publiés` ou `Archivé`. Une procédure encore ouverte au-delà de 24 mois doit être traitée manuellement, avec avis du DPO.

---

## Tableau de correspondance exigences ↔ flux (pour la recette)

| Exigence | Couverte par |
|---|---|
| EXG-22 (formats/tailles) | Relais (`validation.js`) + WF-05 étape 1 |
| EXG-23 (consentement) | Relais (`validation.js`) + WF-05 étape 1 |
| EXG-24 (accusé + numéro) | WF-05 étapes 2 et 5 |
| EXG-25 (cloisonnement des candidatures) | Script 01 (rupture d'héritage) ; hors périmètre du script 02 |
| EXG-26 (blocage serveur après date limite) | WF-04 + WF-05 étape 1 + relais (`verifierRecevabilite`) |
| EXG-32/33 (double opt-in, désabonnement) | WF-08 A/B/C + pages `confirmer.html` / `desabonnement.html` |
| EXG-41 (validation avant publication) | WF-01, WF-06 |
| CDC §7.2 (conservation limitée) | WF-09 |
| CDC §7.3 (secret des déclencheurs) | Relais + contrôle de la clé partagée en tête de WF-05 et WF-08 |
