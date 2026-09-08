# Mise en ligne de opportunites.ageroute.gov.gn
# Fiche destinée à l'administrateur système

Le portail public est un site **statique** : aucune base de données, aucun
langage serveur. Le dépôt de candidature, qui viendra ensuite, ajoute un
service Node.js.

## Infrastructure constatée

Sondage des noms publics, 29 juillet 2026.

### 102.211.199.131 — routeur de bord **Traefik**

| Nom | État |
|---|---|
| `ageroute.gov.gn`, `www` | HTTP 200 |
| `gestion` | HTTP 200 |
| `carte` | HTTP 200, backend nginx 1.27.5 |
| `pilotage` | HTTP 200 |
| `traefik` | HTTP 401, `WWW-Authenticate: Basic realm="traefik"` |
| `geoportail`, `collecte`, `routes` | **certificat auto-signé** |
| `flux` | **HTTP 503** — routeur défini, aucun backend disponible |
| `opportunites` | pointe ici depuis le 4 août 2026 — **HTTP 404 nu** : Traefik reçoit la requête, aucun routeur ne porte ce nom |

L'existence de `traefik.ageroute.gov.gn` et le comportement des hôtes dépourvus
de certificat valide établissent que **Traefik est le routeur de bord**. Le
déploiement passe donc par des étiquettes Docker ou un fournisseur de
configuration Traefik — **ni `sites-available`, ni certbot** sur cette machine.

### 102.211.199.132 — Apache / Ubuntu

Héberge GLPI. Le nom `mail.ageroute.gov.gn` y pointe également, alors que la
messagerie est sur Microsoft 365 (l'autodiscover pointe vers Microsoft) :
reliquat à nettoyer.

---

## Gouvernance — à lire d'abord

Le *Guide de déploiement — Site web institutionnel* (DSI, août 2026) fixe les
règles d'intervention sur 102.211.199.131 :

- le `docker-compose.yml` du serveur est **en lecture seule** ; toute
  modification passe par la DSI après revue (§8) ;
- les **étiquettes de routage Traefik** sont posées par la DSI (§2) ;
- l'accès se fait par **compte dédié et clé SSH**, au périmètre restreint (§3).

Ajouter le portail — un service, une route, un répertoire — relève donc de la
DSI. La demande correspondante, rédigée selon les conventions de ce guide, est
`DEMANDE-DSI-DEPLOIEMENT.md`.

## Déploiement du portail

> **Cible retenue : 102.211.199.131**, derrière Traefik. Le DNS y a été
> repointé le 4 août 2026. Suivre les étapes ci-dessous. La variante Apache
> pour `.132`, conservée plus bas, ne vaut plus que comme solution de repli.

### Étape 1 — DNS

Fait le 4 août 2026 :

```
opportunites.ageroute.gov.gn.  IN A  102.211.199.131
```

Vérification : `dig +short opportunites.ageroute.gov.gn`

**Le portail est en ligne depuis le 4 août 2026, vers 19 h 40 UTC.** Relevé de
recette :

| Contrôle | Résultat |
|---|---|
| `GET /` | `HTTP/2 200`, `server: nginx/1.31.2`, 14 657 octets |
| Certificat | **valide** — `ssl_verify_result=0` sans l'option `-k` |
| CSP servie | `script-src 'self'` — **sans** `unsafe-inline` ni `unsafe-eval` |
| Autres en-têtes | HSTS 1 an, `x-frame-options: DENY`, `nosniff`, `referrer-policy`, `permissions-policy` |
| `data/opportunites.json` | `HTTP/2 200`, structure attendue, listes vides |
| Intégrité | les **8 fichiers** servis ont l'empreinte SHA-256 du paquet de référence |

La CSP stricte et les en-têtes de sécurité prouvent que la mise en service passe
bien par les étiquettes Traefik prévues, et non par un hôte virtuel hérité : le
site institutionnel voisin sert une CSP permissive (`unsafe-inline`,
`unsafe-eval`), qui n'apparaît pas ici.

Reste à faire : **déposer le premier export SharePoint**. Tant qu'il manque, le
portail affiche sa structure et aucune opportunité — les listes `appelsOffres`
et `offresEmploi` sont vides, ce qui est le comportement voulu, préférable à des
données inventées.

### Étape 2 — Fichiers

Le dossier est produit sur le poste d'administration par
`06-preparer-publication.ps1`. Le déposer dans :

```bash
sudo mkdir -p /var/www/opportunites
sudo chown -R deploiement:docker /var/www/opportunites
sudo find /var/www/opportunites -type d -exec chmod 755 {} \;
sudo find /var/www/opportunites -type f -exec chmod 644 {} \;
```

### Étape 3 — Service derrière Traefik

Le fichier `infrastructure/docker/portail-opportunites/docker-compose.yml` du
dépôt déclare un conteneur nginx servant `/var/www/opportunites`, avec les
étiquettes Traefik du routeur, du certificat et des en-têtes de sécurité.

**Deux valeurs à vérifier avant de démarrer**, car elles dépendent de votre
installation :

| Étiquette | Valeur du fichier | À confronter à |
|---|---|---|
| `certresolver` | `letsencrypt` | le nom du résolveur ACME dans votre `traefik.yml` |
| réseau externe | `traefik` | `docker network ls` |

```bash
cd infrastructure/docker/portail-opportunites
docker compose up -d portail
docker compose logs -f portail
```

Le certificat est demandé automatiquement par Traefik : aucune commande
certbot à lancer.

### Étape 4 — Vérification

```bash
curl -I https://opportunites.ageroute.gov.gn/
curl -s https://opportunites.ageroute.gov.gn/data/opportunites.json | head -5
```

Attendu : `HTTP/2 200`, un en-tête `content-security-policy`, et un JSON dont
le champ `genereLe` porte une date récente.

### Étape 5 — Mise à jour des données

Les publications SharePoint doivent remonter sans intervention. Deux montages :

**A — Le poste d'administration pousse.** Tâche planifiée Windows toutes les
15 minutes exécutant `06-preparer-publication.ps1` puis un `scp` vers
`/var/www/opportunites`. Simple, mais dépend d'un poste allumé.

**B — Le serveur tire.** Le script tourne sur un serveur d'exploitation ou
dans Azure Automation avec l'identité applicative par certificat, et dépose le
résultat par rsync. C'est le montage du CDC §3.3, et le seul qui ne dépende
d'aucun compte nominatif.

Le conteneur monte le dossier en lecture seule : le contenu peut être remplacé
à chaud sans le redémarrer.

---

## Points à traiter, indépendants du portail

Constatés en préparant ce déploiement. Ils relèvent de l'exploitation courante.

1. **Tableau de bord Traefik exposé sur Internet.** `traefik.ageroute.gov.gn`
   répond publiquement, protégé par une simple authentification HTTP Basic. Ce
   tableau de bord révèle toute la topologie des services. Le restreindre au
   réseau de l'Agence (middleware `ipAllowList`) ou le fermer.

2. **Trois hôtes sans certificat valide** — `geoportail`, `collecte`,
   `routes` — présentent le certificat auto-signé par défaut de Traefik. Tout
   navigateur affiche un avertissement de sécurité. Cause probable : l'émission
   ACME a échoué. Consulter les journaux Traefik pour ces hôtes, vérifier que
   le challenge HTTP-01 aboutit et le quota Let's Encrypt.

3. **`flux.ageroute.gov.gn` répond 503** : un routeur Traefik existe sans
   backend disponible. Service arrêté ou conteneur absent.

4. **GLPI accessible publiquement.** Un outil interne de gestion de parc
   gagnerait à être restreint au réseau de l'Agence ou placé derrière un VPN.

5. **Certificat de `glpi`.** La note d'exploitation attribuait l'échec de
   certbot à un port 80 fermé en entrée. La mesure du 29 juillet montre que ce
   port **répond**, y compris sur `/.well-known/acme-challenge/`. La cause est
   donc ailleurs — le plus probable étant une redirection systématique vers
   HTTPS qui intercepte le chemin du challenge. L'hôte virtuel du portail
   l'exclut explicitement de la redirection ; appliquer la même exclusion à
   celui de GLPI devrait suffire.

---

## Repli — déploiement sur 102.211.199.132 (Apache)

> Conservé pour mémoire. Le DNS ne pointe plus ici depuis le 4 août 2026 ;
> n'appliquer cette section que si le déploiement sur `.131` devait être
> abandonné, et repointer le DNS d'abord.

Le serveur héberge déjà GLPI sous Apache 2.4.

Configuration fournie :
`services/integrations/relais-portail/deploiement/apache-opportunites.conf`.

```bash
sudo a2enmod ssl headers rewrite
sudo mkdir -p /var/www/opportunites
sudo unzip portail.zip -d /var/www/opportunites
sudo cp apache-opportunites.conf /etc/apache2/sites-available/opportunites.conf
sudo a2ensite opportunites
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d opportunites.ageroute.gov.gn
```

Le port 80 de `.132` répond de l'extérieur, y compris sur
`/.well-known/acme-challenge/` : l'émission du certificat aboutira. La
configuration exclut d'ailleurs ce chemin de la redirection vers HTTPS, qui
est la cause la plus fréquente d'échec.

> Si l'émission échoue malgré tout, basculer sur un **challenge DNS-01**, qui
> ne demande aucun port entrant. C'est aussi la solution au certificat
> manquant de `glpi` sur la même machine.

**Ce que cette variante coûte** : le portail public partage alors sa machine
avec l'outil interne de gestion de parc. Deux services aux exigences de
disponibilité et aux surfaces d'exposition différentes. Acceptable pour
ouvrir, à revoir quand l'accès à `.131` sera rétabli.

## Alternative — serveur nginx sans Traefik

Configurations fournies dans `services/integrations/relais-portail/deploiement/` :
`nginx-opportunites-consultation.conf` pour le mode consultation seule, et
`nginx-opportunites.conf` une fois le relais en service. Le certificat se
demande alors par `certbot --nginx -d opportunites.ageroute.gov.gn`.

---

## Plus tard — le relais de candidature

Quand le flux WF-05 sera en service :

```bash
sudo install -d -m 750 /etc/relais-portail
sudo install -m 600 .env /etc/relais-portail/env   # URL des flux, clé partagée
docker compose --profile candidatures up -d
```

Le service n'a **aucune dépendance npm**. Le profil `candidatures` maintient le
relais à l'arrêt tant qu'il n'est pas explicitement demandé : le portail reste
alors en consultation seule et masque le bouton « Postuler ».
