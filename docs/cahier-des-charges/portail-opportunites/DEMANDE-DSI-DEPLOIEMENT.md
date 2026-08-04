# Demande de déploiement — Portail public des opportunités
## À la Direction des Systèmes d'Information, AGEROUTE Guinée

Rédigée selon les conventions du *Guide de déploiement — Site web institutionnel*
(DSI, août 2026), dont elle reprend la structure de périmètre.

**Objet** : mise en ligne de `opportunites.ageroute.gov.gn`
**Nature** : site statique, consultation seule dans un premier temps
**Serveur visé** : 102.211.199.131

---

## 1. Périmètre demandé

| Élément | Valeur |
|---|---|
| Domaine public | `opportunites.ageroute.gov.gn` |
| Répertoire de travail | `/opt/portail-opportunites` |
| Conteneur | `portail-opportunites` (image `nginx:alpine`) |
| Racine servie | `/opt/portail-opportunites/www` |
| Base de données | **aucune** |
| Volume Docker | **aucun** — un simple montage en lecture seule du répertoire ci-dessus |

Le portail est un **site statique** : ni langage serveur, ni base, ni cache. Le
conteneur ne fait que servir des fichiers, montés en lecture seule.

## 2. Ce qui est demandé à la DSI

1. **Créer le répertoire** `/opt/portail-opportunites/www`, accessible en écriture
   au compte chargé des mises à jour.
2. **Ajouter le service** au `docker-compose.yml` — le fichier étant en lecture
   seule côté intervenant, conformément au §8 du guide. Le bloc à insérer figure
   en annexe.
3. **Déclarer la route Traefik** vers `opportunites.ageroute.gov.gn`, sur le même
   modèle que les domaines existants. Les étiquettes sont fournies en annexe ;
   le certificat sera émis par le résolveur ACME en place.
4. **Ouvrir un accès** au dépôt des mises à jour — clé SSH sur un compte au
   périmètre restreint à ce seul répertoire, selon la procédure du §3 du guide.

## 3. Ce qui n'est pas touché

- Aucune modification des applications en production : ERP (`gestion`),
  géoportail (`carte`), pilotage décisionnel (`pilotage`), site institutionnel.
- Aucune modification des routes Traefik existantes.
- Aucun accès aux volumes, bases ou conteneurs `ageroute-*`.
- Aucune interruption de service : l'ajout d'un service au fichier compose
  n'affecte pas les conteneurs déjà démarrés (`docker compose up -d portail`
  ne recrée que le service nommé).

## 4. Charge et exploitation

| | |
|---|---|
| Poids du site | environ 0,1 Mo, plus les documents publiés (PDF) |
| Trafic attendu | faible — consultation d'avis de marché |
| Mise à jour des données | un fichier JSON régénéré depuis SharePoint, toutes les 15 minutes |
| Redémarrage nécessaire | non : le contenu est monté en lecture seule et remplaçable à chaud |

La mise à jour consiste à déposer un dossier `data/` et un dossier `documents/`
dans la racine servie. Aucune commande n'est nécessaire ensuite.

## 5. Évolution prévue

Le dépôt de candidature en ligne, prévu dans un second temps, ajoutera un
service Node.js écoutant sur un port interne, exposé sous `/api/` du même
domaine. Il fera l'objet d'une demande distincte lorsque les flux Power
Automate correspondants seront en service. **Il n'est pas concerné par la
présente demande.**

---

## Annexe A — Bloc à insérer dans docker-compose.yml

```yaml
  portail-opportunites:
    image: nginx:alpine
    container_name: portail-opportunites
    restart: unless-stopped
    volumes:
      - /opt/portail-opportunites/www:/usr/share/nginx/html:ro
    networks:
      - <reseau-traefik>
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=<reseau-traefik>"
      - "traefik.http.routers.portail-opp.rule=Host(`opportunites.ageroute.gov.gn`)"
      - "traefik.http.routers.portail-opp.entrypoints=websecure"
      - "traefik.http.routers.portail-opp.tls=true"
      - "traefik.http.routers.portail-opp.tls.certresolver=<resolveur-acme>"
      - "traefik.http.routers.portail-opp.middlewares=portail-opp-entetes@docker"
      - "traefik.http.services.portail-opp.loadbalancer.server.port=80"
      - "traefik.http.middlewares.portail-opp-entetes.headers.stsSeconds=31536000"
      - "traefik.http.middlewares.portail-opp-entetes.headers.contentTypeNosniff=true"
      - "traefik.http.middlewares.portail-opp-entetes.headers.frameDeny=true"
      - "traefik.http.middlewares.portail-opp-entetes.headers.referrerPolicy=strict-origin-when-cross-origin"
      - "traefik.http.middlewares.portail-opp-entetes.headers.customResponseHeaders.Content-Security-Policy=default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
```

Les deux valeurs entre chevrons sont à remplacer par celles de l'installation :
nom du réseau Docker partagé avec Traefik, et nom du résolveur ACME. Le fichier
complet et commenté figure dans le dépôt :
`infrastructure/docker/portail-opportunites/docker-compose.yml`.

## Annexe B — Contenu à déposer

Une archive `portail.zip` est fournie avec la présente demande. Elle contient :

```
index.html                 page principale
confirmer.html             confirmation d'abonnement (inactive pour l'instant)
desabonnement.html         désabonnement (inactive pour l'instant)
assets/                    feuille de style, scripts, configuration
data/opportunites.json     avis et recrutements publiés
documents/                 DAO, TDR et avis d'attribution
```

À déplier dans `/opt/portail-opportunites/www`.

## Annexe C — Vérification après mise en ligne

```bash
curl -I https://opportunites.ageroute.gov.gn/
curl -s https://opportunites.ageroute.gov.gn/data/opportunites.json | head -5
```

Attendu : `HTTP/2 200`, un en-tête `content-security-policy`, et un JSON dont le
champ `genereLe` porte une date récente.

---

## Annexe D — Points d'exploitation constatés

Relevés lors de la préparation, par simple consultation publique des services.
Sans rapport avec la présente demande, mais portés à connaissance.

1. **`traefik.ageroute.gov.gn` répond publiquement**, protégé par une simple
   authentification HTTP Basic. Ce tableau de bord expose la topologie complète
   des services. Un middleware `ipAllowList` restreindrait l'accès au réseau de
   l'Agence.

2. **`geoportail`, `collecte` et `routes` servent un certificat auto-signé** —
   celui par défaut de Traefik, signe d'une émission ACME qui n'a pas abouti.
   Les visiteurs de ces trois sites voient un avertissement de sécurité.

3. **`flux.ageroute.gov.gn` répond 503** : routeur déclaré sans backend
   disponible.

4. **`mail.ageroute.gov.gn` porte deux enregistrements A concurrents**
   (102.211.199.132 et 35.215.107.76) alors que la messagerie est sur
   Microsoft 365. Reliquat probable d'une migration.

5. **GLPI est le site par défaut d'Apache sur 102.211.199.132** : tout nom
   pointant vers cette machine aboutit à sa page de connexion. Un site par
   défaut répondant 404 éviterait qu'un nom mal configuré expose un outil
   interne.
