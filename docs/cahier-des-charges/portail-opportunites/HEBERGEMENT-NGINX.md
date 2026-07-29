# Mise en ligne de opportunites.ageroute.gov.gn
# Fiche destinée à l'administrateur système

Le portail public est un site **statique** : aucune base de données, aucun
langage serveur, aucune dépendance à installer pour la partie consultation.
Le dépôt de candidature, qui viendra ensuite, ajoute un service Node.js.

## Ce qui existe déjà

Sondage du 29 juillet 2026 :

| Nom | Adresse | État |
|---|---|---|
| `ageroute.gov.gn` | 102.211.199.131 | HTTP 200, site institutionnel |
| `www.ageroute.gov.gn` | 102.211.199.131 | idem |
| `gestion.ageroute.gov.gn` | 102.211.199.131 | HTTP 200, page de 449 octets |
| `geoportail.ageroute.gov.gn` | 102.211.199.131 | HTTPS en **certificat auto-signé** |
| `mail.ageroute.gov.gn` | 102.211.199.132 | messagerie |
| `opportunites.ageroute.gov.gn` | — | **aucun enregistrement DNS** |

Tous les services web de l'Agence sont donc servis par **un seul serveur**,
102.211.199.131, sous nginx (`server: nginx/1.31.2`), avec HTTPS, redirection
HTTP→HTTPS en 301 et les en-têtes `x-content-type-options`, `x-frame-options`
et `referrer-policy` déjà posés.

Le socle est en place : il n'y a qu'un hôte virtuel à ajouter.

> **À signaler à l'exploitation, sans rapport avec ce projet.**
> `geoportail.ageroute.gov.gn` présente un certificat auto-signé : tout
> navigateur affiche un avertissement de sécurité avant d'ouvrir le site. Le
> serveur disposant manifestement de certificats valides pour les autres noms,
> l'étendre au géoportail réglerait le problème.

---

## Étape 1 — Enregistrement DNS

Créer un enregistrement A :

```
opportunites.ageroute.gov.gn.   IN A   102.211.199.131
```

Un CNAME vers `ageroute.gov.gn` convient également. Compter jusqu'à
quelques heures de propagation ; vérifier avec :

```bash
dig +short opportunites.ageroute.gov.gn
```

## Étape 2 — Certificat TLS

Si certbot est déjà en place sur le serveur :

```bash
sudo certbot --nginx -d opportunites.ageroute.gov.gn
```

Sinon, ajouter le nom au certificat existant, ou en émettre un dédié. Le
sous-domaine doit résoudre avant l'émission.

## Étape 3 — Dépôt des fichiers

Le dossier à déposer est produit sur le poste d'administration par :

```powershell
.\06-preparer-publication.ps1 -SiteUrl "<site SharePoint>" `
    -ClientId "<GUID>" -Interactif -Sortie "C:\publication\site"
```

Il contient `index.html`, `assets/`, `data/opportunites.json` et
`documents/`. Le transférer vers :

```
/var/www/opportunites
```

Par exemple, depuis le poste Windows :

```powershell
scp -r C:\publication\site\* utilisateur@102.211.199.131:/var/www/opportunites/
```

Droits attendus : lecture pour l'utilisateur nginx (`www-data` en général),
écriture pour le compte qui dépose.

```bash
sudo chown -R deploiement:www-data /var/www/opportunites
sudo find /var/www/opportunites -type d -exec chmod 755 {} \;
sudo find /var/www/opportunites -type f -exec chmod 644 {} \;
```

## Étape 4 — Hôte virtuel nginx

La configuration de référence est versionnée dans le dépôt :

```
services/integrations/relais-portail/deploiement/nginx-opportunites.conf
```

L'installer, en adaptant les chemins de certificats :

```bash
sudo cp nginx-opportunites.conf /etc/nginx/sites-available/opportunites
sudo ln -s /etc/nginx/sites-available/opportunites /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**En consultation seule**, la section `location /api/` et le bloc `upstream`
sont inutiles : les commenter tant que le relais n'est pas déployé, sinon
nginx refusera de démarrer faute de trouver le service sur le port 8080.

## Étape 5 — Mise à jour automatique des données

Les publications SharePoint doivent remonter sur le site sans intervention.
Deux montages possibles.

**A — Le poste d'administration pousse** (le plus simple)
Tâche planifiée Windows, toutes les 15 minutes, exécutant
`06-preparer-publication.ps1` puis un `scp`. Inconvénient : dépend d'un poste
allumé.

**B — Le serveur tire** (recommandé en production)
Le script tourne sur un serveur d'exploitation ou dans Azure Automation avec
l'identité applicative par certificat, et dépose le résultat par rsync. C'est
le montage décrit au CDC §3.3, et le seul qui ne dépende d'aucun compte
nominatif.

Dans les deux cas, le flux WF-07 déclenche en plus une synchronisation
immédiate après chaque publication.

---

## Vérification après mise en ligne

```bash
curl -I https://opportunites.ageroute.gov.gn/
curl -s https://opportunites.ageroute.gov.gn/data/opportunites.json | head -5
```

Attendu : `HTTP/2 200`, un en-tête `content-security-policy`, et un JSON dont
le champ `genereLe` porte une date récente.

Dans un navigateur, la console ne doit afficher aucune erreur de CSP. Si des
ressources sont bloquées, c'est que la directive `style-src` ou `font-src`
doit être ajustée aux domaines réellement utilisés.

---

## Plus tard — le relais de candidature

Quand le flux WF-05 sera en service, il faudra ajouter sur ce même serveur :

- **Node.js 20 ou plus** (`apt install nodejs`) ;
- le service `services/integrations/relais-portail`, déposé dans
  `/opt/relais-portail` ;
- l'unité systemd fournie dans `deploiement/relais-portail.service` ;
- le fichier d'environnement `/etc/relais-portail/env` en mode 600, contenant
  les URL des déclencheurs Power Automate et la clé partagée ;
- la réactivation de la section `location /api/` de l'hôte virtuel.

Le service n'a **aucune dépendance npm** : il n'y a rien à installer au-delà
de Node lui-même. Une image Docker est également fournie si l'exploitation
préfère un conteneur.
