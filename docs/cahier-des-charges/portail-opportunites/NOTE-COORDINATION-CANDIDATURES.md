# Note de coordination — dépôt de candidature
## À l'intention de la session qui a produit le prototype

Cette note répond au message accompagnant `provisionnement-candidatures.js`.
Elle n'est pas un désaveu : le prototype d'interface est du travail réel et
réutilisable. Elle signale que **le back-office visé existe déjà**, et que
l'intermédiaire décrit comme « la vraie question d'architecture » est construit,
testé et documenté.

Tout ce qui suit est vérifiable dans le dépôt `tidiokamsar/NAFA`, branche
`claude/files-sharepoint-access-48juys`.

---

## 1. Ne pas exécuter le script de provisionnement

`Liste-Candidatures` est créée par `infrastructure/sharepoint/portail-opportunites/01-provision-sharepoint.ps1`,
lignes 291 à 315. Le lancer par REST produirait une seconde structure,
concurrente de celle que le relais et WF-05 alimentent.

### Schéma réel

| Colonne interne | Type | Note |
|---|---|---|
| `NumeroDossier` | Texte, requis | **indexé unique** |
| `NomCandidat` | Texte, requis | |
| `PrenomCandidat` | Texte, requis | |
| `CourrielCandidat` | Texte, requis | |
| `TelephoneCandidat` | Texte | |
| `DateDepot` | Date | indexé |
| `ConsentementRGPD` | Choix — `Oui` | preuve EXG-23 |
| `StatutDossier` | Choix — `Reçu` / `En cours d'examen` / `Clôturé` | |
| `OffreLiee` | Lookup → `Liste-Recrutements`, champ `ReferenceRH` | |

La liste est créée `-Hidden $true`.

### Deux points qui ne se voient pas dans un `GET`

**L'unicité de `NumeroDossier` est fonctionnelle, pas cosmétique.** WF-05
régénère le numéro en cas de collision ; c'est la contrainte d'index qui rend
cette boucle fiable. Sans elle, deux candidats peuvent recevoir le même accusé
de réception.

**Les permissions sont rompues** (ligne 386) : héritage cassé sur
`Liste-Candidatures`, la bibliothèque `Candidatures` et `Liste-Abonnes`, droits
restreints à `AGR-PRT-Admins` et `AGR-PRT-RH-Candidatures`.

Une liste créée par REST **hérite des permissions du site**. Les CV, adresses et
téléphones des candidats deviendraient lisibles par tout membre du site. C'est
EXG-25, et c'est le point le plus grave des trois.

---

## 2. L'intermédiaire existe

> « les candidats sont externes au tenant, donc aucune écriture directe
> authentifiée n'est possible. Il faudra un intermédiaire — Power Automate
> déclenché par HTTP, une Azure Function, ou un point d'entrée sur ton
> serveur 131. »

Le diagnostic est juste, et la troisième option est celle qui a été retenue et
réalisée :

```
services/integrations/relais-portail/
  src/serveur.js       routage, en-têtes de sécurité, limitation de débit
  src/validation.js    EXG-22 (formats, tailles), EXG-23 (consentement)
  src/catalogue.js     EXG-26 — recevabilité de l'offre, côté serveur
  src/captcha.js       Turnstile / reCAPTCHA / hCaptcha
  src/flux.js          appel signé vers Power Automate
  test/                37 tests, tous verts, sans dépendance npm
```

Le flux Power Automate correspondant a sa feuille de construction pas à pas :
`docs/cahier-des-charges/portail-opportunites/CONSTRUCTION-WF-05-PAS-A-PAS.md`.

### Le contrat, à viser depuis le prototype

**`POST /api/candidatures`** — même origine que le site, donc aucune
configuration CORS.

```json
{
  "offreRef": "RH/2026/001",
  "nom": "…",
  "prenom": "…",
  "courriel": "…",
  "telephone": "…",
  "consentement": true,
  "pieces": [ { "nom": "cv.pdf", "type": "application/pdf", "contenu": "<base64>" } ]
}
```

| Réponse | Signification |
|---|---|
| `202` | dépôt accepté, numéro de dossier renvoyé |
| `400` | consentement absent, format ou taille refusés |
| `409` | offre clôturée ou résultats publiés — EXG-26 |
| `429` | plus de 5 dépôts par heure depuis cette adresse |
| `503` | flux non configuré côté serveur |

Le jeton CAPTCHA est vérifié **par le relais** et ne part jamais vers Power
Automate. Les URL de déclencheur restent côté serveur : ce sont des secrets
d'exploitation (CDC §7.3), et la CI refuse toute publication qui en contiendrait.

### Ce que cela change pour le prototype

Remplacer `AgrStore.addCandidature` et `AgrFiles.put` par un `fetch` sur
`/api/candidatures`. Rien d'autre. Le stockage `localStorage` / `IndexedDB`
disparaît — et avec lui le fait que des pièces de candidature séjournent dans le
navigateur d'un poste partagé.

Les contrôles de format, de taille unitaire, de cumul et de doublon déjà écrits
côté prototype **restent utiles** : ils évitent au candidat un aller-retour
réseau pour une erreur évidente. Ils ne remplacent pas les contrôles serveur,
qui font foi.

---

## 3. Ce qui est réellement ouvert

Deux questions posées dans le message tiennent debout.

### Le champ de motivation

Le schéma actuel ne prévoit **aucune colonne de lettre de motivation** : le
relais ne transmet que des pièces jointes. Si le formulaire capture une saisie
libre, il manque un champ.

À ajouter dans `01-provision-sharepoint.ps1`, pas par la console :

```powershell
ChampNote $lCand "MotivationCandidat" "Motivation"
```

puis à propager dans `validation.js` (longueur maximale, nettoyage) et dans
WF-05. C'est une modification à trois endroits — c'est précisément pourquoi elle
ne doit pas se faire dans un seul.

### Les jeux de termes

`DirectionRH` et `LieuRH` pointent sur des jeux de termes créés par le script 01,
dans le groupe **`AGEROUTE`** :

| Jeu | Valeurs |
|---|---|
| `Regions` | Conakry, Kindia, Boké, Labé, Mamou, Faranah, Kankan, N'Zérékoré, National |
| `Bailleurs` | Budget national, Banque mondiale, BAD, BID, Union européenne, Autre |
| `Directions` | Direction Générale, Direction Technique, DAF, Passation des Marchés, Ressources Humaines, Communication, DSI |

Les GUID ne sont pas à deviner : ils se lisent en une commande, sans droits
particuliers.

```powershell
Get-PnPTermSet -TermGroup "AGEROUTE" | Select-Object Name, Id
```

Le champ `LieuRH` pointe sur `Regions`, pas sur un jeu distinct — c'est
volontaire : un lieu d'affectation est une région.

---

## 4. Ce qui reste à faire, dans l'ordre

1. **Repointer le prototype** sur `POST /api/candidatures`.
2. **Construire WF-05** — la feuille pas à pas est écrite.
3. **Décider du champ de motivation**, et le poser proprement s'il est retenu.
4. Le reste — WF-01, WF-04, WF-08 — a ses feuilles ; WF-02, WF-03, WF-06 et
   WF-09 n'ont que leurs spécifications.

**WF-09 mérite d'être remonté dans cette liste** : c'est la purge des
candidatures à durée de conservation limitée. Son absence est un problème de
conformité sur des données personnelles, pas un manque de confort.

---

## Sur la méthode

Coller un script dans la console d'une session SharePoint authentifiée exécute
du code avec les droits complets de l'utilisateur connecté. C'est un schéma que
Microsoft signale explicitement dans la console des navigateurs, et il sert ici
à franchir une barrière décrite comme une limite de permissions.

Ce n'est pas un reproche : l'intention était de débloquer un travail. Mais sur
un tenant qui héberge des données de candidature, le provisionnement a un
chemin — les scripts PowerShell du dépôt, versionnés, idempotents, relisibles —
et il vaut mieux l'emprunter.
