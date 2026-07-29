# AGEROUTE Guinée — Portail Public des Opportunités
# GUIDE DE DÉPLOIEMENT EN PRODUCTION

Version 1.1 — Juillet 2026 · Réf. : Cahier des charges v2.0 (architecture scénario A)

Ce guide décrit le déploiement de l'architecture retenue : **SharePoint Online en back-office** (saisie, validation, stockage sécurisé) et **front public découplé** sur `opportunites.ageroute.gov.gn`, alimenté automatiquement par la couche de publication.

## Où se trouve quoi dans le dépôt

| Composant | Emplacement |
|---|---|
| Front public (site statique) | `apps/web/portail-opportunites/` |
| Relais sécurisé des candidatures et abonnements | `services/integrations/relais-portail/` |
| Scripts de provisioning et de publication SharePoint | `infrastructure/sharepoint/portail-opportunites/` |
| Spécification des flux Power Automate | `docs/cahier-des-charges/portail-opportunites/CONSTRUCTION-FLUX-POWER-AUTOMATE.md` |

Le relais est le composant que le kit initial laissait à écrire : c'est lui qui porte le CAPTCHA, la limitation de débit, la clé partagée et les contrôles serveur, et qui garde secrètes les URL des déclencheurs Power Automate.

---

## Phase 0 — Prérequis (DSI)

1. **Tenant Microsoft 365** actif avec SharePoint Online et Power Automate (licences des contributeurs incluant les connecteurs standard ; le déclencheur HTTP de WF-05/WF-07/WF-08 requiert une licence Premium sur le compte de service).
2. **Compte de service** `svc-portail@ageroute.gov.gn` : boîte aux lettres, licence Power Automate Premium, MFA avec exclusion d'accès conditionnel documentée ou identité applicative.
3. **Inscription d'application Entra ID** « AGR-PRT-Publication » :
   - Authentification par **certificat** (généré et stocké en coffre) ;
   - Autorisation Graph/SharePoint `Sites.Selected`, accordée uniquement au site du portail (moindre privilège, CDC §7.3).
   - Procédure détaillée : `INSCRIPTION-APPLICATION-ENTRA-ID.md`. Cette étape est **bloquante** : aucune application Microsoft de première partie (Azure CLI, PnP Management Shell) n'est utilisable à sa place, elles échouent en `AADSTS65002`.
4. **Poste d'administration** : PowerShell 7 + module `PnP.PowerShell` (`Install-Module PnP.PowerShell -Scope CurrentUser`).
5. **Hébergement web public** pour `opportunites.ageroute.gov.gn` : le serveur 102.211.199.131 de l'Agence, dont le routeur de bord est Traefik. Procédure et configuration : `HEBERGEMENT.md`.
6. **Exécution Node.js 20 ou plus** pour le relais (conteneur, App Service, ou service systemd sur le serveur web de l'Agence) et **compte CAPTCHA** (Cloudflare Turnstile, reCAPTCHA ou hCaptcha).

## Phase 1 — Provisioning du back-office SharePoint

Exécuter (d'abord sur l'environnement de **recette**, jamais directement en production) :

```powershell
cd infrastructure/sharepoint/portail-opportunites
./01-provision-sharepoint.ps1 `
    -AdminUrl "https://ageroutegn-admin.sharepoint.com" `
    -SiteUrl  "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites" `
    -ClientId "<GUID de l'application Entra ID>"
```

Le script crée : le site de gestion, les jeux de termes (Régions, Bailleurs, Directions), les 7 bibliothèques, les 4 listes typées avec règles de validation, les 6 groupes de sécurité, et **rompt l'héritage** sur les données personnelles — liste et bibliothèque Candidatures (EXG-25) ainsi que la liste des abonnés. Il est ré-exécutable sans risque.

Il couvre également ce qui figurait auparavant en actions manuelles :

- colonne `ReferenceMarche` sur `DAO`, `Additifs`, `Attributions`, `AppelsOffres` et `RecrutementTDR` (rattachement utilisé par WF-02) ;
- colonne `GelArchivage` sur les appels d'offres (WF-04 n'archive pas un dossier gelé) ;
- liste `Liste-Abonnes` complète (WF-08) ;
- **indexation** des colonnes filtrées en OData par les flux et **unicité** des références et des numéros de dossier ;
- validation du format des références au niveau du champ (le kit initial posait cette règle par un appel qui échouait silencieusement).

**Actions manuelles restantes** :
- Peupler les groupes avec les personnes nommées par chaque direction (procès-verbal d'habilitation conservé).
- Vérifier dans le centre d'administration que le partage externe de la collection est bien « Désactivé » (le script le force, sauf appel avec `-ConserverPartageExterne`).

## Phase 2 — Construction des flux Power Automate

Suivre pas à pas `CONSTRUCTION-FLUX-POWER-AUTOMATE.md` : les neuf flux y sont spécifiés avec déclencheurs, conditions de déclenchement (anti-boucle), expressions, contrôles serveur et gestion d'erreurs. Ordre conseillé : WF-01 → WF-04 → WF-05 → WF-07 → WF-08 → WF-02 → WF-03 → WF-06 → WF-09.

**Règles impératives** :
- Tous les flux dans la solution `AGR-PRT-Automatisation`, connexions du compte de service uniquement.
- Les URL des déclencheurs HTTP (WF-05, WF-07, WF-08) sont des **secrets** : consignées au coffre, jamais dans le code du front.
- WF-05 et WF-08 contrôlent la **clé partagée** (`x-cle-relais`) en première condition et répondent 401 sinon : une URL qui fuite ne suffit pas à déposer une candidature.

## Phase 3 — Couche de publication

1. Créer un **runbook Azure Automation** (ou tâche planifiée sur un serveur d'exploitation) exécutant `02-export-publication.ps1` avec l'identité applicative par certificat.
2. Planification : toutes les 15 minutes + déclenchement immédiat par WF-07 après chaque publication.
3. Publier le dossier de sortie vers l'hébergement web (rsync/SFTP, ou pipeline CI/CD). Le script écrit le JSON de façon **atomique** (fichier temporaire puis renommage) : le front ne peut pas lire un fichier à moitié écrit.
4. Le script renvoie un **code de sortie** (0 succès / 1 échec) et alimente `journal-synchronisation.log` : c'est sur ces deux éléments que s'appuie le contrôle quotidien de cohérence (CDC §9.2).

## Phase 4 — Déploiement du front public et du relais

### 4.1 Front public

1. Déployer le contenu de `apps/web/portail-opportunites/public/` à la racine de `opportunites.ageroute.gov.gn`.
2. Adapter **uniquement** `assets/config.js` : points d'entrée du relais, racine des documents, clé publique du CAPTCHA. Aucun secret n'y figure.
3. Tant que la synchronisation n'a pas tourné, le site affiche une liste vide et un bandeau explicite. Il n'invente jamais de publication : le jeu d'exemple (`data/opportunites.exemple.json`) porte un marqueur `"exemple": true` qui déclenche l'avertissement « données de démonstration ».

### 4.2 Relais des candidatures

1. Déployer `services/integrations/relais-portail/` (aucune dépendance npm à installer).
2. Renseigner les variables d'environnement à partir de `.env.example` — en particulier les URL des flux, la clé partagée et le secret CAPTCHA, tous issus du coffre.
3. Publier le relais sous le **même domaine** que le site, sur `/api/` (reverse proxy Nginx / règle de routage). Le front n'a alors besoin d'aucune configuration CORS.
4. Si le relais est derrière un proxy, positionner `PROXY_DE_CONFIANCE=true` afin que la limitation de débit compte les vraies adresses clientes — et **jamais** sinon, sous peine de contournement par un en-tête forgé.
5. Contrôler le démarrage : `GET /api/sante` renvoie l'état, le fournisseur CAPTCHA et la présence du catalogue.

### 4.3 Configuration du serveur web

- HTTPS obligatoire, redirection HTTP→HTTPS, HSTS.
- En-têtes de sécurité : le relais les pose déjà sur ce qu'il sert ; les reproduire sur l'hébergement statique si le front est servi séparément. La CSP de référence figure dans `services/integrations/relais-portail/src/serveur.js` (constante `CSP`) — le site fonctionne sans `'unsafe-inline'`.
- Mettre en place la mesure d'audience souveraine (Matomo) — aucun traceur publicitaire. Ajouter alors son domaine à `connect-src` et `script-src`.

## Phase 5 — Recette (avant toute ouverture au public)

Dérouler au minimum les parcours du CDC §12.2 :

| # | Test | Résultat attendu |
|---|------|------------------|
| 1 | Créer un AO en « En validation » → approuver | Statut « Publié », visible sur le front < 20 min, courriel aux abonnés |
| 2 | Déposer une candidature complète | Numéro CAND-AAAA-NNNNN, accusé courriel, dossier dans la bibliothèque sécurisée |
| 3 | Tenter un dépôt après la date limite (appel direct de l'API) | Rejet serveur « offre clôturée » (HTTP 409) |
| 4 | Déposer un fichier .exe / 25 Mo | Rejet avec message explicite (HTTP 400) |
| 5 | Accéder aux candidatures avec un compte DPMP | Accès refusé et journalisé |
| 6 | Couper la synchronisation puis publier | Alerte DSI P2 sous 1 h ; bandeau d'obsolescence sur le front |
| 7 | Audit accessibilité (échantillon) + test 3G | WCAG 2.1 AA ; affichage < 3 s |
| 8 | Appeler l'URL du flux WF-05 sans la clé partagée | HTTP 401, aucun dossier créé |
| 9 | Déposer 6 candidatures d'affilée depuis la même adresse | HTTP 429 avec `Retry-After` à partir de la 6e |
| 10 | S'abonner puis suivre le lien de confirmation, puis celui de désabonnement | Statut `Confirmé` puis `Désabonné` dans `Liste-Abonnes` |

La suite automatisée du relais couvre les points 3, 4, 8 et 9 :

```bash
cd services/integrations/relais-portail && npm test
```

Un PV de recette signé conditionne le passage en production.

## Phase 6 — Mise en production et VSR

1. Rejouer la Phase 1 sur la collection de **production** (le script est idempotent), puis exporter/importer la solution Power Platform de recette vers production avec les références de connexion de production.
2. Reprise des avis en cours : saisie des AO et offres actifs, contrôle croisé DPMP/RH.
3. Bascule DNS de `opportunites.ageroute.gov.gn`, communication officielle de lancement.
4. **VSR de 3 mois** : supervision renforcée, revue hebdomadaire des journaux, correction des anomalies, puis PV d'admission définitive.

## Exploitation courante (rappels)

- Revue **trimestrielle** des habilitations, en particulier `AGR-PRT-RH-Candidatures`.
- **Purge automatique** des candidatures 24 mois après clôture : flux WF-09, spécifié dans le document des flux — obligation de conservation limitée (CDC §7.2).
- Export hebdomadaire de sauvegarde des listes + test de restauration semestriel.
- Rotation de la **clé partagée** du relais au moins une fois par an, et à chaque départ d'une personne ayant eu accès au coffre : mettre à jour la variable du relais puis la condition d'entrée de WF-05 et WF-08.
- Toute évolution de structure passe par le script 01 modifié, testé en recette, versionné dans Git.
