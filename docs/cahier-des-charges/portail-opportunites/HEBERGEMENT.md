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
| `opportunites` | DNS créé, aucun routeur — à faire |

L'existence de `traefik.ageroute.gov.gn` et le comportement des hôtes dépourvus
de certificat valide établissent que **Traefik est le routeur de bord**. Le
déploiement passe donc par des étiquettes Docker ou un fournisseur de
configuration Traefik — **ni `sites-available`, ni certbot** sur cette machine.

### 102.211.199.132 — Apache / Ubuntu

Héberge GLPI. Le nom `mail.ageroute.gov.gn` y pointe également, alors que la
messagerie est sur Microsoft 365 (l'autodiscover pointe vers Microsoft) :
reliquat à nettoyer.

---

## Déploiement du portail

### Étape 1 — DNS

Déjà fait :

```
opportunites.ageroute.gov.gn.  IN A  102.211.199.131
```

Vérification : `dig +short opportunites.ageroute.gov.gn`

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

5. **Port 80 fermé en entrée sur 102.211.199.132**, ce qui empêche le challenge
   ACME pour `glpi`. À faire ouvrir chez l'hébergeur, ou basculer sur un
   challenge DNS-01, qui ne demande aucun port entrant — souvent préférable
   pour un serveur d'outils internes.

---

## Alternative — serveur sans Traefik

Si le portail devait être déployé sur une machine dont le frontal est nginx,
la configuration correspondante est fournie dans
`services/integrations/relais-portail/deploiement/` :
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
