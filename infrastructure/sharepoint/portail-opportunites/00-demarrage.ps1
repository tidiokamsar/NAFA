<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 00 — Démarrage assisté (poste d'administration)
=====================================================================
 Enchaîne les trois étapes qui doivent être exécutées depuis un poste
 de l'Agence, parce qu'elles exigent une authentification interactive
 auprès d'Entra ID :

   1. installation du module PnP.PowerShell ;
   2. inscription de l'application « AGR-PRT-Publication » ;
   3. provisionnement du back-office (script 01).

 USAGE — recette (à faire en premier)
   .\00-demarrage.ps1 -Tenant "ageroutegn"

 USAGE — production, une fois la recette validée
   .\00-demarrage.ps1 -Tenant "ageroutegn" -Production `
                      -ClientId "<GUID obtenu à la première exécution>"

 Le script ne détruit rien : le provisionnement est idempotent et
 l'inscription d'application est réutilisée si son identifiant est
 fourni.
=====================================================================
#>

param(
    [Parameter(Mandatory = $true)] [string] $Tenant,
    [string] $ClientId,
    [string] $NomSite = "AGR-PRT-Opportunites",
    [switch] $Production,
    [switch] $SauterProvisionnement
)

$ErrorActionPreference = "Stop"
function Titre($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "    [OK] $m" -ForegroundColor Green }
function Note($m)  { Write-Host "    $m" -ForegroundColor DarkGray }

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "PowerShell 7 est requis (version détectée : $($PSVersionTable.PSVersion)). " +
          "Installer depuis https://aka.ms/powershell"
}

$suffixe  = if ($Production) { "" } else { "-Recette" }
$siteUrl  = "https://$Tenant.sharepoint.com/sites/$NomSite$suffixe"
$adminUrl = "https://$Tenant-admin.sharepoint.com"

Write-Host @"

  AGEROUTE — Portail des opportunités
  Environnement : $(if ($Production) { 'PRODUCTION' } else { 'RECETTE' })
  Site cible    : $siteUrl

"@ -ForegroundColor Yellow

if ($Production) {
    Note "Le provisionnement rompt l'héritage de permissions et désactive"
    Note "le partage externe de la collection. Il doit avoir été éprouvé"
    Note "en recette au préalable."
    $reponse = Read-Host "Confirmer l'exécution en PRODUCTION ? (taper OUI)"
    if ($reponse -ne "OUI") { Write-Host "Abandon."; exit 1 }
}

# ---------------------------------------------------------------
# 1. Module PnP.PowerShell
# ---------------------------------------------------------------
Titre "Module PnP.PowerShell"
if (Get-Module -ListAvailable -Name PnP.PowerShell) {
    Ok "Déjà installé"
} else {
    Note "Installation en cours (quelques minutes)..."
    Install-Module PnP.PowerShell -Scope CurrentUser -Force -AllowClobber
    Ok "Installé"
}
Import-Module PnP.PowerShell -ErrorAction Stop

# ---------------------------------------------------------------
# 2. Inscription d'application Entra ID
# ---------------------------------------------------------------
Titre "Inscription d'application Entra ID"
if ($ClientId) {
    Ok "Application fournie : $ClientId"
} else {
    Note "Aucune application Microsoft de première partie n'étant"
    Note "préautorisée sur ce tenant, une inscription dédiée est"
    Note "obligatoire (voir INSCRIPTION-APPLICATION-ENTRA-ID.md)."
    Note "Une fenêtre de connexion va s'ouvrir : accepter le consentement."

    $app = Register-PnPEntraIDAppForInteractiveLogin `
              -ApplicationName "AGR-PRT-Publication" `
              -Tenant "$Tenant.onmicrosoft.com" `
              -Interactive

    $ClientId = $app.'AzureAppId/ClientId'
    if (-not $ClientId) { $ClientId = $app.AppId }
    if (-not $ClientId) {
        throw "L'inscription n'a pas renvoyé d'identifiant d'application. " +
              "Créer l'application manuellement (voir la voie B du document) " +
              "puis relancer avec -ClientId."
    }
    Ok "Application créée : $ClientId"

    Write-Host "`n  >>> CONSERVER CET IDENTIFIANT <<<" -ForegroundColor Yellow
    Write-Host "      ClientId = $ClientId`n" -ForegroundColor Yellow
    Note "La propagation du consentement peut prendre une minute."
    Start-Sleep -Seconds 60
}

# ---------------------------------------------------------------
# 3. Provisionnement du back-office
# ---------------------------------------------------------------
if ($SauterProvisionnement) {
    Titre "Provisionnement ignoré (-SauterProvisionnement)"
} else {
    Titre "Provisionnement du back-office"
    $script01 = Join-Path $PSScriptRoot "01-provision-sharepoint.ps1"
    if (-not (Test-Path $script01)) {
        throw "01-provision-sharepoint.ps1 introuvable dans $PSScriptRoot"
    }
    & $script01 -AdminUrl $adminUrl -SiteUrl $siteUrl -ClientId $ClientId
}

# ---------------------------------------------------------------
# Suite des opérations
# ---------------------------------------------------------------
Write-Host @"

=====================================================================
 ETAPE SUIVANTE
=====================================================================
 ClientId a conserver : $ClientId
 Site provisionne     : $siteUrl

 1. Peupler les groupes de securite (PV d'habilitation) :
      AGR-PRT-Admins, AGR-PRT-DPMP-Contrib, AGR-PRT-RH-Contrib,
      AGR-PRT-Valideurs, AGR-PRT-Comm, AGR-PRT-RH-Candidatures

 2. Construire les flux Power Automate — commencer par WF-05 :
      docs/cahier-des-charges/portail-opportunites/
        CONSTRUCTION-FLUX-POWER-AUTOMATE.md

 3. Planifier la publication :
      .\02-export-publication.ps1 -SiteUrl "$siteUrl" ...

 4. Deployer le relais et le front (guide, phase 4).
"@ -ForegroundColor Yellow

if (-not $Production) {
    Write-Host @"
 5. Une fois la recette validee, rejouer en production :
      .\00-demarrage.ps1 -Tenant "$Tenant" -Production -ClientId "$ClientId"
=====================================================================
"@ -ForegroundColor Yellow
} else {
    Write-Host "=====================================================================" -ForegroundColor Yellow
}
