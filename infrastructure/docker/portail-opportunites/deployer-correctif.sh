#!/usr/bin/env bash
# Déploiement du correctif front — opportunites.ageroute.gov.gn
# À lancer sur .131. S'arrête à la première anomalie et ne touche
# à rien tant que la sauvegarde n'est pas vérifiée non vide.
set -euo pipefail

WWW=/opt/portail-opportunites/www
PAQUET=${1:-/tmp/portail-corrige.tar.gz}
HORO=$(date +%Y%m%d-%H%M%S)
SAUV=/opt/portail-opportunites/sauvegardes/avant-$HORO

ok()  { printf '  \033[32m[OK]\033[0m %s\n' "$1"; }
err() { printf '  \033[31m[ECHEC]\033[0m %s\n' "$1" >&2; exit 1; }

echo "=== 1. Contrôles préalables ==="
[[ -f $PAQUET ]] || err "Paquet introuvable : $PAQUET"
[[ -d $WWW ]]    || err "Racine servie introuvable : $WWW"
tar tzf "$PAQUET" >/dev/null || err "Archive illisible."
# Le config.js du serveur ne doit pas être écrasé : il porte le mode
# consultation. Si le paquet en contient un, on refuse de continuer.
if tar tzf "$PAQUET" | grep -q 'assets/config\.js$'; then
  err "Le paquet contient assets/config.js — il écraserait la configuration du serveur."
fi
ok "Paquet valide, sans config.js"

echo "=== 2. Sauvegarde ==="
sudo mkdir -p "$SAUV"
sudo cp -a "$WWW/index.html" "$WWW/confirmer.html" "$WWW/desabonnement.html" \
           "$WWW/assets" "$SAUV/"
# Le point qui manquait hier : on vérifie que la sauvegarde existe
# vraiment avant d'écraser quoi que ce soit.
n=$(sudo find "$SAUV" -type f | wc -l)
[[ $n -ge 4 ]] || err "Sauvegarde vide ou incomplète ($n fichiers) — rien n'a été écrasé."
ok "Sauvegarde : $n fichiers dans $SAUV"

echo "=== 3. Dépôt du correctif ==="
sudo tar xzf "$PAQUET" -C "$WWW"
ok "Archive dépliée"

echo "=== 4. Droits ==="
sudo find "$WWW" -type d -exec chmod 755 {} +
sudo find "$WWW" -type f -exec chmod 644 {} +
ok "Droits appliqués"

echo "=== 5. Contrôle sur place ==="
c=$(grep -c dateAbsente "$WWW/assets/portail.js" || true)
[[ $c -eq 4 ]] || err "portail.js : $c occurrences de dateAbsente, 4 attendues. Restaurer : $SAUV"
ok "portail.js corrigé (4 occurrences)"
grep -q '612 78 33 33' "$WWW/index.html" || err "index.html ne porte pas le bon numéro."
ok "index.html à jour"
[[ -f $WWW/assets/config.js ]] || err "assets/config.js a disparu — restaurer depuis $SAUV"
ok "config.js préservé"

echo
echo "  Terminé. Aucun redémarrage nécessaire : le contenu est servi à chaud."
echo "  Retour arrière si besoin :"
echo "    sudo cp -a $SAUV/* $WWW/"
echo
echo "  Vérification depuis l'extérieur :"
echo "    curl -s https://opportunites.ageroute.gov.gn/assets/portail.js | grep -c dateAbsente   # doit rendre 4"
