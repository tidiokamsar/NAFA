# portail-opportunites

Front public du **portail des opportunités de l'AGEROUTE Guinée** : consultation des appels d'offres, téléchargement des DAO et des TDR, dépôt de candidature en ligne et abonnement aux publications.

Site statique, sans dépendance ni étape de build : le contenu de `public/` est déposé tel quel à la racine de `opportunites.ageroute.gov.gn`.

## Arborescence

```
public/
├── index.html                    Page principale
├── confirmer.html                Confirmation d'abonnement (WF-08, flux B)
├── desabonnement.html            Désabonnement (WF-08, flux C — EXG-33)
├── assets/
│   ├── config.js                 SEUL fichier à adapter au déploiement
│   ├── portail.css               Feuille de style
│   ├── portail.js                Logique du portail
│   └── abonnement.js             Pages de confirmation / désabonnement
└── data/
    └── opportunites.exemple.json Jeu d'exemple (marqué "exemple": true)
outils/serveur-dev.js             Serveur statique de relecture locale
```

`data/opportunites.json` est **produit** par la couche de publication (`infrastructure/sharepoint/portail-opportunites/02-export-publication.ps1`) et n'est pas versionné.

## Relecture locale

```bash
npm run demo    # copie le jeu d'exemple en data/opportunites.json
npm run dev     # http://localhost:4173
npm run verifier # contrôle syntaxique des scripts
```

Pour tester le parcours de candidature de bout en bout, servir plutôt le dossier depuis le relais (`RACINE_STATIQUE`) : le front et l'API sont alors sur la même origine, comme en production.

## Points d'attention

- **Aucun secret dans le front.** Le formulaire de candidature appelle le relais (`/api/candidatures`), jamais Power Automate directement. Les URL des déclencheurs sont des secrets d'exploitation (CDC §7.3).
- **Pas de contenu fabriqué.** Sans données publiées, le site affiche une liste vide et un bandeau explicatif. Les « dernières publications » sont dérivées des avis réels, pas rédigées à la main.
- **Compatible CSP stricte.** Aucun gestionnaire d'événement en ligne, aucun attribut `style` : le site fonctionne sans `'unsafe-inline'`.
- **Contrôles clients non normatifs.** Les vérifications de format et de taille (EXG-22) sont dupliquées pour le confort de l'usager ; celles du relais et du flux WF-05 font foi.
- **Fraîcheur des données.** Si `genereLe` dépasse `seuilObsolescenceHeures`, un bandeau prévient le public que la synchronisation est en retard.

## Configuration (`assets/config.js`)

| Clé | Rôle |
|---|---|
| `sourceDonnees` | Chemin du JSON publié |
| `pointEntreeCandidatures` | Route du relais ; vide ⇒ bouton « Postuler » masqué |
| `pointEntreeAbonnements` | Route du relais ; vide ⇒ bloc d'abonnement masqué |
| `racineDocuments` | Préfixe des chemins de documents relatifs |
| `extensionsAutorisees`, `tailleMaxFichierMo`, `tailleMaxTotalMo` | Contrôles d'ergonomie, à garder alignés sur le relais |
| `cleCaptcha` | Clé **publique** du widget CAPTCHA |
| `seuilObsolescenceHeures` | Déclenchement du bandeau d'obsolescence |
