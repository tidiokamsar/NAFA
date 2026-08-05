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
