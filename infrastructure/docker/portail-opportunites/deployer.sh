#!/usr/bin/env bash
# =================================================================
#  Portail des opportunités AGEROUTE — déploiement sur 102.211.199.131
# =================================================================
#  Une seule commande, à lancer sur le serveur dont le routeur de
#  bord est Traefik.
#
#      sudo ./deployer.sh
#      sudo ./deployer.sh --zip /chemin/portail.zip
#
#  Le script vérifie l'environnement avant d'agir, détecte le réseau
#  Docker et le résolveur ACME de votre Traefik plutôt que de les
#  supposer, et n'écrit rien tant qu'un contrôle échoue.
#
#  Idempotent : relançable autant de fois que nécessaire.
# =================================================================
set -euo pipefail

RACINE_WEB="/var/www/opportunites"
SERVICE="portail"
ZIP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip) ZIP="${2:-}"; shift 2 ;;
    --racine) RACINE_WEB="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done

ici="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
depot="$(cd "$ici/../../.." && pwd)"
front="$depot/apps/web/portail-opportunites/public"

etape() { printf '\n\033[36m=== %s ===\033[0m\n' "$1"; }
ok()    { printf '    \033[32m[OK]\033[0m %s\n' "$1"; }
info()  { printf '    %s\n' "$1"; }
echec() { printf '    \033[31m[ECHEC]\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------
etape "Contrôles préalables"

[[ $EUID -eq 0 ]] || echec "Lancer avec sudo."
command -v docker >/dev/null || echec "Docker est absent de cette machine."
docker compose version >/dev/null 2>&1 || echec "Le greffon « docker compose » est absent."
[[ -d "$front" ]] || echec "Site introuvable : $front — le dépôt est-il complet ?"
ok "Docker et le dépôt sont en place"

# Le réseau partagé avec Traefik porte des noms variables selon les
# installations : on le cherche plutôt que de le supposer.
reseau=""
for candidat in traefik proxy web traefik_default traefik-net; do
  if docker network inspect "$candidat" >/dev/null 2>&1; then reseau="$candidat"; break; fi
done
if [[ -z "$reseau" ]]; then
  echo "    Réseaux Docker disponibles :"
  docker network ls --format '      {{.Name}}'
  echec "Aucun réseau Traefik reconnu. Relancer en fixant RESEAU_TRAEFIK=<nom>."
fi
reseau="${RESEAU_TRAEFIK:-$reseau}"
ok "Réseau Traefik : $reseau"

# Résolveur ACME : lu dans la configuration du conteneur Traefik.
conteneur_traefik="$(docker ps --filter 'ancestor=traefik' --format '{{.Names}}' | head -1)"
resolveur="${CERTRESOLVER:-}"
if [[ -z "$resolveur" && -n "$conteneur_traefik" ]]; then
  resolveur="$(docker inspect "$conteneur_traefik" 2>/dev/null \
    | grep -oE 'certificatesresolvers\.[a-zA-Z0-9_-]+\.' | head -1 \
    | sed 's/certificatesresolvers\.//; s/\.$//' || true)"
fi
if [[ -z "$resolveur" ]]; then
  info "Résolveur ACME non détecté — valeur par défaut « letsencrypt » retenue."
  info "Si l'émission du certificat échoue, relancer avec CERTRESOLVER=<nom>."
  resolveur="letsencrypt"
fi
ok "Résolveur ACME : $resolveur"

# ---------------------------------------------------------------
etape "Dépôt des fichiers du site"

mkdir -p "$RACINE_WEB"

if [[ -n "$ZIP" ]]; then
  [[ -f "$ZIP" ]] || echec "Archive introuvable : $ZIP"
  command -v unzip >/dev/null || echec "unzip est absent (apt install unzip)."
  unzip -o -q "$ZIP" -d "$RACINE_WEB"
  ok "Archive dépliée : $(basename "$ZIP")"
else
  # Sans archive, on publie le site du dépôt. Les données viendront
  # du premier export SharePoint ; d'ici là le portail affiche une
  # liste vide et un bandeau explicite, plutôt que des données
  # inventées.
  cp -r "$front"/*.html "$front/assets" "$RACINE_WEB/"
  mkdir -p "$RACINE_WEB/data"
  info "Aucune archive fournie : site publié sans données."
  info "Le portail affichera un bandeau tant que le premier export"
  info "SharePoint n'aura pas été déposé dans $RACINE_WEB/data/."
fi

# Consultation seule tant que le relais n'est pas en service : les
# points d'entrée vides masquent proprement le bouton « Postuler ».
if [[ ! -f "$RACINE_WEB/assets/config.js" ]] || ! grep -q "pointEntreeCandidatures" "$RACINE_WEB/assets/config.js"; then
  cat > "$RACINE_WEB/assets/config.js" <<'JS'
/* Engendré par deployer.sh — mode consultation seule.
   Aucun secret ici : les URL des déclencheurs Power Automate restent
   côté serveur, dans le relais (CDC §7.3). */
window.PORTAIL_CONFIG = {
  sourceDonnees: 'data/opportunites.json',
  pointEntreeCandidatures: '',
  pointEntreeAbonnements: '',
  racineDocuments: '',
  extensionsAutorisees: ['pdf', 'docx', 'jpg', 'jpeg', 'png'],
  tailleMaxFichierMo: 10,
  tailleMaxTotalMo: 30,
  cleCaptcha: '',
  seuilObsolescenceHeures: 6
};
JS
  ok "Configuration en consultation seule"
fi

find "$RACINE_WEB" -type d -exec chmod 755 {} \;
find "$RACINE_WEB" -type f -exec chmod 644 {} \;
ok "Fichiers en place dans $RACINE_WEB"

# Aucune URL de déclencheur ne doit partir sur un serveur public.
if grep -rqiE "logic\.azure\.com|triggers/manual/paths/invoke" "$RACINE_WEB" 2>/dev/null; then
  echec "Une URL de déclencheur Power Automate figure dans les fichiers publiés."
fi
ok "Aucun secret dans les fichiers publiés"

# ---------------------------------------------------------------
etape "Mise en service derrière Traefik"

cd "$ici"
RESEAU_TRAEFIK="$reseau" CERTRESOLVER="$resolveur" \
  docker compose up -d "$SERVICE"

ok "Conteneur démarré"
info "Traefik demande le certificat automatiquement ; compter une minute."

# ---------------------------------------------------------------
etape "Vérification"

for i in $(seq 1 20); do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
          https://opportunites.ageroute.gov.gn/ 2>/dev/null || echo 000)"
  [[ "$code" == "200" ]] && break
  sleep 6
done

echo
if [[ "${code:-000}" == "200" ]]; then
  ok "Le portail répond (HTTP $code)"
  curl -s -o /dev/null -w "    Validation TLS : %{http_code} (000 = certificat pas encore émis)\n" \
       --max-time 10 https://opportunites.ageroute.gov.gn/ || true
  echo
  echo "    Étapes suivantes :"
  echo "      - déposer le premier export SharePoint dans $RACINE_WEB/data/"
  echo "      - planifier sa mise à jour toutes les 15 minutes"
else
  info "Le portail ne répond pas encore (dernier code : ${code:-000})."
  info "Journaux : docker compose logs -f $SERVICE"
  info "Vérifier que le DNS pointe bien vers cette machine :"
  info "  dig +short opportunites.ageroute.gov.gn"
fi
