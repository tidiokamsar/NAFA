# Consigne à transmettre à une session disposant d'un accès au serveur

Ce document contient le texte à copier-coller tel quel dans une session Claude
qui, elle, a un shell sur `102.211.199.131`. Il est écrit pour être autonome :
la session destinataire n'a besoin d'aucun contexte préalable.

---

## Le prompt

> **Contexte.** Je suis la DSI d'AGEROUTE Guinée. Le portail public des
> opportunités (`opportunites.ageroute.gov.gn`) doit être mis en ligne sur le
> serveur `102.211.199.131`, dont le routeur de bord est **Traefik**. Le DNS
> pointe déjà vers cette machine. Le site est prêt : c'est un site **statique**
> — pas de base de données, pas de langage serveur.
>
> **Ce que tu dois faire.** Le dépôt `tidiokamsar/NAFA`, branche
> `claude/files-sharepoint-access-48juys`, contient un installateur autonome :
>
> ```
> infrastructure/docker/portail-opportunites/installer-portail.sh
> ```
>
> Le site y est **embarqué en base64** : il n'y a rien à transférer, rien à
> cloner sur le serveur. Copie ce seul fichier sur `102.211.199.131` et lance :
>
> ```bash
> sudo bash installer-portail.sh
> ```
>
> **Contraintes à respecter absolument.**
>
> 1. **Ne modifie pas le `docker-compose.yml` du serveur.** Il est en lecture
>    seule côté intervenant (§8 du guide DSI). L'installateur crée son propre
>    projet Compose dans `/opt/portail-opportunites` ; Traefik découvre le
>    conteneur par le socket Docker, quel que soit son projet. C'est voulu.
> 2. **Ne touche à aucune route ni à aucun conteneur existant** : ERP
>    (`gestion`), géoportail (`carte`), pilotage décisionnel (`pilotage`), site
>    institutionnel. `docker compose up -d` dans `/opt/portail-opportunites` ne
>    concerne que le portail.
> 3. **Ne redémarre pas Traefik.** Les étiquettes sont lues à chaud.
> 4. **Aucune URL de déclencheur Power Automate ne doit figurer dans les
>    fichiers publiés** (ce sont des secrets d'exploitation, CDC §7.3).
>    L'installateur le vérifie et s'arrête si c'est le cas — ne contourne pas
>    ce contrôle.
> 5. Le portail démarre en **consultation seule** : les points d'entrée de
>    candidature sont vides, le bouton « Postuler » est masqué. C'est le
>    comportement attendu tant que les flux Power Automate ne sont pas en
>    service. Ne les remplis pas.
>
> **Deux valeurs dépendent de l'installation** — l'installateur les détecte
> seul, mais si la détection échoue il te le dira et tu pourras les forcer :
>
> ```bash
> sudo RESEAU_TRAEFIK=<nom-du-réseau> CERTRESOLVER=<nom-du-résolveur> bash installer-portail.sh
> ```
>
> Pour les trouver :
> ```bash
> docker network ls
> docker inspect $(docker ps --filter name=traefik -q) | grep -o 'certificatesresolvers\.[a-z]*' | head -1
> ```
>
> **Vérification à me rapporter, telle quelle.**
>
> ```bash
> curl -I https://opportunites.ageroute.gov.gn/
> curl -s -o /dev/null -w '%{http_code}\n' https://opportunites.ageroute.gov.gn/     # sans -k : valide le certificat
> curl -s https://opportunites.ageroute.gov.gn/data/opportunites.json
> ```
>
> Attendu : `HTTP/2 200`, un en-tête `content-security-policy`, un code `200`
> **sans** l'option `-k` (c'est ce qui prouve que le certificat est valide, pas
> le simple 200), et un JSON avec les clés `appelsOffres` et `offresEmploi`
> — vides pour l'instant, c'est normal.
>
> **Si le certificat n'est pas émis** : le challenge HTTP-01 exige que le port
> 80 réponde sur ce nom. Trois hôtes de ce serveur (`geoportail`, `collecte`,
> `routes`) présentent déjà un certificat auto-signé, signe d'échecs ACME
> antérieurs — regarde les journaux Traefik avant de conclure, et vérifie le
> quota Let's Encrypt (5 échecs par heure et par domaine).
>
> **Ne fais rien d'autre.** Pas de mise à jour système, pas de nettoyage
> d'images, pas de correction des autres services. Si tu constates un problème
> ailleurs, signale-le sans y toucher.
>
> **Réversible en une commande**, si besoin :
> ```bash
> cd /opt/portail-opportunites && docker compose down
> ```

---

## Si la session destinataire n'a pas accès au dépôt

Lui transmettre directement le fichier `installer-portail.sh` (39 Ko, le site
est dedans). Il n'a aucune dépendance : `bash`, `docker`, `base64`, et `unzip`
ou `python3`.

## Après la mise en ligne

Le portail affiche la structure mais aucune opportunité, tant que le premier
export SharePoint n'a pas été déposé. Le produire depuis le poste
d'administration :

```powershell
.\06-preparer-publication.ps1 -SiteUrl "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites" `
   -ClientId "<GUID>" -Interactif -Sortie "C:\publication\site"
```

puis déposer `data/opportunites.json` et le dossier `documents/` dans
`/opt/portail-opportunites/www/`. Le contenu est monté en lecture seule et
remplaçable à chaud : **aucun redémarrage** n'est nécessaire.
