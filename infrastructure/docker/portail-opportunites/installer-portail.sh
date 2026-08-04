#!/usr/bin/env bash
# =====================================================================
#  Portail public des opportunités — AGEROUTE Guinée
#  Installateur autonome pour 102.211.199.131 (routeur de bord Traefik)
# =====================================================================
#  Le site est embarqué dans ce fichier : rien à cloner, rien à
#  transférer. Une seule commande :
#
#      sudo bash installer-portail.sh
#
#  Ce qu'il fait, et rien d'autre :
#    - dépose le site dans /opt/portail-opportunites/www ;
#    - démarre un conteneur nginx:alpine qui le sert en lecture seule ;
#    - pose les étiquettes Traefik du routeur, du certificat et des
#      en-têtes de sécurité.
#
#  Ce qu'il NE fait PAS :
#    - il ne touche pas au docker-compose.yml du serveur (lecture
#      seule côté intervenant, §8 du guide DSI) : le portail vit dans
#      son propre projet Compose, sous /opt/portail-opportunites ;
#    - il ne modifie aucune route existante ;
#    - il ne recrée, n'arrête et ne redémarre aucun conteneur en
#      service. Les applications de production ne sont pas concernées.
#
#  Idempotent : relançable sans dommage.
#  Réversible : cd /opt/portail-opportunites && docker compose down
# =====================================================================
set -euo pipefail

RACINE="/opt/portail-opportunites"
DOMAINE="opportunites.ageroute.gov.gn"

etape() { printf '\n\033[36m=== %s ===\033[0m\n' "$1"; }
ok()    { printf '    \033[32m[OK]\033[0m %s\n' "$1"; }
info()  { printf '    %s\n' "$1"; }
echec() { printf '    \033[31m[ECHEC]\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------
etape "Contrôles préalables"
[[ $EUID -eq 0 ]] || echec "Lancer avec sudo."
command -v docker >/dev/null || echec "Docker est absent de cette machine."
docker compose version >/dev/null 2>&1 || echec "Le greffon « docker compose » est absent."
command -v base64 >/dev/null || echec "base64 est absent."
ok "Docker en place"

# Le nom du réseau partagé avec Traefik varie d'une installation à
# l'autre : on le cherche, on ne le suppose pas.
reseau="${RESEAU_TRAEFIK:-}"
if [[ -z "$reseau" ]]; then
  # D'abord le réseau auquel le conteneur Traefik est réellement
  # rattaché — c'est la source la plus sûre.
  ct="$(docker ps --format '{{.Names}} {{.Image}}' | awk '/traefik/{print $1; exit}')"
  if [[ -n "$ct" ]]; then
    reseau="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$ct" \
              | grep -v '^bridge$\|^host$\|^none$' | head -1 || true)"
  fi
fi
if [[ -z "$reseau" ]]; then
  for c in traefik proxy web traefik_default traefik-net; do
    docker network inspect "$c" >/dev/null 2>&1 && { reseau="$c"; break; }
  done
fi
if [[ -z "$reseau" ]]; then
  echo "    Réseaux Docker disponibles :"; docker network ls --format '      {{.Name}}'
  echec "Réseau Traefik non identifié. Relancer avec RESEAU_TRAEFIK=<nom>."
fi
ok "Réseau Traefik : $reseau"

# Résolveur ACME : lu dans la configuration effective de Traefik.
resolveur="${CERTRESOLVER:-}"
if [[ -z "$resolveur" && -n "${ct:-}" ]]; then
  resolveur="$(docker inspect "$ct" 2>/dev/null \
    | grep -oE 'certificatesresolvers\.[a-zA-Z0-9_-]+\.' | head -1 \
    | sed 's/certificatesresolvers\.//; s/\.$//' || true)"
fi
if [[ -z "$resolveur" ]]; then
  # Dernier recours : le résolveur déjà utilisé par un autre service.
  resolveur="$(docker ps -q | xargs -r docker inspect 2>/dev/null \
    | grep -oE 'certresolver=[a-zA-Z0-9_-]+' | head -1 | cut -d= -f2 || true)"
fi
[[ -n "$resolveur" ]] || { resolveur="letsencrypt"; info "Résolveur ACME non détecté — « letsencrypt » retenu."; }
ok "Résolveur ACME : $resolveur"

# Le certificat ne sera émis que si le nom pointe bien ici.
attendu="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | head -3 | tr '\n' ' ')"
resolu="$(getent hosts "$DOMAINE" 2>/dev/null | awk '{print $1}' | head -1 || true)"
info "DNS $DOMAINE -> ${resolu:-non résolu} ; adresses locales : ${attendu:-inconnues}"

# ---------------------------------------------------------------
etape "Dépôt du site"
mkdir -p "$RACINE/www"
charge="$(mktemp)"; trap 'rm -f "$charge"' EXIT
sed -n '/^__CHARGE__$/,$p' "$0" | tail -n +2 | base64 -d > "$charge"
if command -v unzip >/dev/null; then
  unzip -oq "$charge" -d "$RACINE/www"
else
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$charge" "$RACINE/www" \
    || echec "Ni unzip ni python3 pour déplier l'archive (apt install unzip)."
fi
mkdir -p "$RACINE/www/data" "$RACINE/www/documents"
find "$RACINE/www" -type d -exec chmod 755 {} +
find "$RACINE/www" -type f -exec chmod 644 {} +
ok "Site déposé dans $RACINE/www ($(find "$RACINE/www" -type f | wc -l) fichiers)"

# Un site public ne doit jamais porter d'URL de déclencheur.
if grep -rqiE "logic\.azure\.com|triggers/manual/paths/invoke" "$RACINE/www" 2>/dev/null; then
  echec "Une URL de déclencheur Power Automate figure dans les fichiers publiés."
fi
ok "Aucun secret dans les fichiers publiés"

# ---------------------------------------------------------------
etape "Déclaration du service"
cat > "$RACINE/docker-compose.yml" <<YML
# Projet Compose propre au portail. Le docker-compose.yml du serveur
# n'est pas modifié : Traefik découvre ce conteneur par le socket
# Docker, quel que soit le projet auquel il appartient.
services:
  portail-opportunites:
    image: nginx:alpine
    container_name: portail-opportunites
    restart: unless-stopped
    volumes:
      - $RACINE/www:/usr/share/nginx/html:ro
    networks: [reseau]
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=$reseau"
      - "traefik.http.routers.portail-opp.rule=Host(\`$DOMAINE\`)"
      - "traefik.http.routers.portail-opp.entrypoints=websecure"
      - "traefik.http.routers.portail-opp.tls=true"
      - "traefik.http.routers.portail-opp.tls.certresolver=$resolveur"
      - "traefik.http.routers.portail-opp.middlewares=portail-opp-entetes@docker"
      - "traefik.http.services.portail-opp.loadbalancer.server.port=80"
      - "traefik.http.routers.portail-opp-http.rule=Host(\`$DOMAINE\`)"
      - "traefik.http.routers.portail-opp-http.entrypoints=web"
      - "traefik.http.routers.portail-opp-http.middlewares=portail-opp-https@docker"
      - "traefik.http.middlewares.portail-opp-https.redirectscheme.scheme=https"
      - "traefik.http.middlewares.portail-opp-https.redirectscheme.permanent=true"
      - "traefik.http.middlewares.portail-opp-entetes.headers.stsSeconds=31536000"
      - "traefik.http.middlewares.portail-opp-entetes.headers.stsIncludeSubdomains=true"
      - "traefik.http.middlewares.portail-opp-entetes.headers.contentTypeNosniff=true"
      - "traefik.http.middlewares.portail-opp-entetes.headers.frameDeny=true"
      - "traefik.http.middlewares.portail-opp-entetes.headers.referrerPolicy=strict-origin-when-cross-origin"
      - "traefik.http.middlewares.portail-opp-entetes.headers.customResponseHeaders.Content-Security-Policy=default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
      - "traefik.http.middlewares.portail-opp-entetes.headers.customResponseHeaders.Permissions-Policy=geolocation=(), microphone=(), camera=(), interest-cohort=()"
networks:
  reseau:
    external: true
    name: $reseau
YML
ok "$RACINE/docker-compose.yml écrit"

etape "Mise en service"
cd "$RACINE"
docker compose up -d
ok "Conteneur démarré (aucun autre service touché)"
info "Traefik demande le certificat ; compter une à deux minutes."

# ---------------------------------------------------------------
etape "Vérification"
for i in $(seq 1 20); do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAINE/" 2>/dev/null || echo 000)"
  [[ "$code" == "200" ]] && break
  sleep 6
done
echo
if [[ "${code:-000}" == "200" ]]; then
  ok "Le portail répond (HTTP $code)"
  tls="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAINE/" 2>/dev/null || echo 000)"
  if [[ "$tls" == "200" ]]; then ok "Certificat valide (validation sans contournement : $tls)"
  else info "Certificat pas encore émis (validation : $tls). Réessayer dans deux minutes ;"
       info "en cas d'échec persistant : docker logs \$(docker ps --filter name=traefik -q) | tail -50"; fi
  echo
  info "Reste à faire : déposer le premier export SharePoint dans"
  info "  $RACINE/www/data/opportunites.json"
  info "Le contenu est monté en lecture seule et remplaçable à chaud :"
  info "aucun redémarrage nécessaire après une mise à jour."
else
  info "Le portail ne répond pas encore (dernier code : ${code:-000})."
  info "  docker logs portail-opportunites --tail 50"
  info "  docker logs \$(docker ps --filter name=traefik -q) --tail 50"
  info "  getent hosts $DOMAINE   # le nom doit pointer vers cette machine"
fi
exit 0
__CHARGE__
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
