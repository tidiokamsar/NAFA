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
#  Les pièces publiées (DAO, TDR, avis signés) voyagent à part :
#  elles pèsent des mégaoctets là où le site pèse des kilooctets.
#  Posez documents.zip à côté du script, il sera déplié tout seul.
#  Sinon, indiquez-le :
#
#      sudo bash installer-portail.sh /chemin/documents.zip
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
DOCUMENTS="${1:-}"

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

# Les pièces publiées : facultatives ici, indispensables pour que les
# boutons « Télécharger le DAO » et « Télécharger les TDR » aboutissent.
if [[ -z "$DOCUMENTS" && -f "$(dirname "$0")/documents.zip" ]]; then
  DOCUMENTS="$(dirname "$0")/documents.zip"
fi
if [[ -n "$DOCUMENTS" ]]; then
  if [[ -f "$DOCUMENTS" ]]; then
    if command -v unzip >/dev/null; then
      unzip -oq "$DOCUMENTS" -d "$RACINE/www"
    else
      python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
        "$DOCUMENTS" "$RACINE/www" || echec "Impossible de déplier $DOCUMENTS."
    fi
    find "$RACINE/www/documents" -type d -exec chmod 755 {} + 2>/dev/null || true
    find "$RACINE/www/documents" -type f -exec chmod 644 {} + 2>/dev/null || true
    ok "Pièces publiées déposées ($(find "$RACINE/www/documents" -type f 2>/dev/null | wc -l) fichiers)"
  else
    echec "Archive des pièces introuvable : $DOCUMENTS"
  fi
else
  info "Aucun documents.zip fourni : les avis s'afficheront, mais les"
  info "boutons de téléchargement resteront sans cible."
fi

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
BAAAAABQSwUGAAAAAAsACwCfAwAAHGQAAAAA
