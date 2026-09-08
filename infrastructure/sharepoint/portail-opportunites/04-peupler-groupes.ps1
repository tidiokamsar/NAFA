<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 04 — Peuplement des groupes de sécurité
=====================================================================
 Dernier geste manuel de la phase 1 du guide de déploiement. Les six
 groupes sont créés par le script 01 mais restent vides : tant qu'ils
 le sont, personne ne peut contribuer et les approbations de WF-01
 n'ont aucun destinataire.

 Les habilitations sont décrites dans un fichier CSV, ce qui laisse
 une trace exploitable pour le procès-verbal d'habilitation et pour
 la revue trimestrielle exigée par le CDC §7.1.

 FORMAT DU CSV (séparateur point-virgule, encodage UTF-8)
   Groupe;Utilisateur
   AGR-PRT-Admins;tidiane.diallo@ageroute.gov.gn
   AGR-PRT-DPMP-Contrib;fatoumata.bah@ageroute.gov.gn

 USAGE
   .\04-peupler-groupes.ps1 `
      -SiteUrl "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites-Recette" `
      -ClientId "<GUID>" -Fichier ".\habilitations.csv"

   .\04-peupler-groupes.ps1 -SiteUrl "..." -ClientId "..." -Etat

 Idempotent : un utilisateur déjà membre n'est pas réajouté.
=====================================================================
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [string] $Fichier,
    [switch] $Etat,
    [switch] $Retirer
)

$ErrorActionPreference = "Stop"
function Etape($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "    [OK] $m" -ForegroundColor Green }
function Info($m)  { Write-Host "    $m" -ForegroundColor DarkGray }
function Alerte($m){ Write-Host "    [!!] $m" -ForegroundColor Yellow }

$GROUPES = @(
    "AGR-PRT-Admins",
    "AGR-PRT-DPMP-Contrib",
    "AGR-PRT-RH-Contrib",
    "AGR-PRT-Valideurs",
    "AGR-PRT-Comm",
    "AGR-PRT-RH-Candidatures"
)

Etape "Connexion"
Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
Ok $SiteUrl

# ---------------------------------------------------------------
# État des habilitations
# ---------------------------------------------------------------
if ($Etat -or -not $Fichier) {
    Etape "État des groupes"
    $vides = 0
    foreach ($nom in $GROUPES) {
        $membres = @(Get-PnPGroupMember -Identity $nom -ErrorAction SilentlyContinue |
                     Where-Object { $_.LoginName -notlike "*spo-grid-all-users*" })
        if ($membres.Count -eq 0) {
            Alerte "$nom : aucun membre"
            $vides++
        } else {
            Ok "$nom : $($membres.Count) membre(s)"
            foreach ($m in $membres) { Info "  - $($m.Title) <$($m.Email)>" }
        }
    }

    if ($vides -gt 0) {
        Write-Host "`n$vides groupe(s) vide(s)." -ForegroundColor Yellow
        Write-Host "Le groupe AGR-PRT-RH-Candidatures conditionne l'acces aux" -ForegroundColor Yellow
        Write-Host "dossiers de candidature : le laisser vide rend la" -ForegroundColor Yellow
        Write-Host "bibliotheque inaccessible aux RH (EXG-25)." -ForegroundColor Yellow
    }
    if (-not $Fichier) { return }
}

# ---------------------------------------------------------------
# Application du fichier d'habilitations
# ---------------------------------------------------------------
if (-not (Test-Path $Fichier)) {
    throw "Fichier d'habilitations introuvable : $Fichier"
}

$lignes = Import-Csv -Path $Fichier -Delimiter ";" -Encoding UTF8
if (-not $lignes) { throw "Le fichier $Fichier est vide." }

# Contrôle complet avant d'agir : mieux vaut refuser un fichier
# comportant une faute que d'appliquer la moitié des habilitations.
Etape "Contrôle du fichier"
$anomalies = @()
foreach ($l in $lignes) {
    if (-not $l.Groupe -or -not $l.Utilisateur) {
        $anomalies += "Ligne incomplète : « $($l | Out-String) »"
        continue
    }
    if ($GROUPES -notcontains $l.Groupe.Trim()) {
        $anomalies += "Groupe inconnu : $($l.Groupe)"
    }
    if ($l.Utilisateur.Trim() -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        $anomalies += "Adresse invalide : $($l.Utilisateur)"
    }
}
if ($anomalies.Count -gt 0) {
    Write-Host "`nFichier refusé :" -ForegroundColor Red
    $anomalies | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "$($anomalies.Count) anomalie(s) dans $Fichier — aucune habilitation appliquée."
}
Ok "$($lignes.Count) habilitation(s) contrôlée(s)"

Etape $(if ($Retirer) { "Retrait des habilitations" } else { "Application des habilitations" })
$appliquees = 0
foreach ($l in $lignes) {
    $groupe = $l.Groupe.Trim()
    $utilisateur = $l.Utilisateur.Trim()

    $dejaMembre = @(Get-PnPGroupMember -Identity $groupe -ErrorAction SilentlyContinue |
                    Where-Object { $_.Email -eq $utilisateur -or $_.LoginName -like "*$utilisateur" }).Count -gt 0

    try {
        if ($Retirer) {
            if ($dejaMembre) {
                Remove-PnPGroupMember -LoginName $utilisateur -Identity $groupe
                Ok "$utilisateur retiré de $groupe"
                $appliquees++
            } else {
                Info "$utilisateur n'était pas membre de $groupe"
            }
        } else {
            if ($dejaMembre) {
                Info "$utilisateur déjà membre de $groupe"
            } else {
                Add-PnPGroupMember -LoginName $utilisateur -Identity $groupe | Out-Null
                Ok "$utilisateur ajouté à $groupe"
                $appliquees++
            }
        }
    } catch {
        # Un compte inexistant ne doit pas interrompre le traitement
        # des autres habilitations.
        Alerte "$utilisateur / $groupe — $($_.Exception.Message -replace '[\r\n]+', ' ')"
    }
}

Write-Host @"

=====================================================================
 $appliquees habilitation(s) appliquee(s)
=====================================================================
 Conserver le fichier CSV : il constitue la trace des habilitations
 pour le proces-verbal, et la base de la revue trimestrielle
 exigee par le CDC section 7.1.

 Etat courant :
   .\04-peupler-groupes.ps1 -SiteUrl "$SiteUrl" -ClientId "$ClientId" -Etat
=====================================================================
"@ -ForegroundColor Yellow
