<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 06 — Préparation du dossier à mettre en ligne
=====================================================================
 Assemble en un seul dossier tout ce qui doit être déposé sur
 opportunites.ageroute.gov.gn :

   - le site public (apps/web/portail-opportunites/public) ;
   - les données publiées, produites par le script 02 ;
   - les documents publics copiés depuis les bibliothèques ;
   - un fichier de configuration adapté à l'environnement visé.

 MODE PAR DÉFAUT : CONSULTATION SEULE
 Tant que les flux Power Automate et le relais ne sont pas en
 service, les points d'entrée de candidature et d'abonnement sont
 laissés vides. Le portail affiche alors les avis et les documents,
 et masque proprement le bouton « Postuler » ainsi que le bloc
 d'abonnement — plutôt que de proposer des fonctions qui
 échoueraient devant l'usager.

 Passer -AvecCandidatures dès que le relais est déployé.

 USAGE — recette
   .\06-preparer-publication.ps1 `
      -SiteUrl "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites-Recette" `
      -ClientId "<GUID>" -Interactif -Sortie "C:\publication\site"

 USAGE — production, avec candidatures
   .\06-preparer-publication.ps1 -SiteUrl "..." -ClientId "<GUID>" `
      -Thumbprint "<empreinte>" -Tenant "ageroutegn.onmicrosoft.com" `
      -Sortie "C:\publication\site" -AvecCandidatures -CleCaptcha "<cle publique>"
=====================================================================
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [Parameter(Mandatory = $true)] [string] $Sortie,
    [string] $Thumbprint,
    [string] $Tenant,
    [switch] $Interactif,
    [switch] $AvecCandidatures,
    [string] $CleCaptcha = "",
    [switch] $SansExport
)

$ErrorActionPreference = "Stop"
function Etape($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "    [OK] $m" -ForegroundColor Green }
function Info($m)  { Write-Host "    $m" -ForegroundColor DarkGray }

# Le script vit dans infrastructure/sharepoint/portail-opportunites,
# le front quatre niveaux plus haut.
$racineDepot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$front = Join-Path $racineDepot "apps\web\portail-opportunites\public"
if (-not (Test-Path $front)) {
    throw "Site public introuvable : $front"
}

# ---------------------------------------------------------------
# 1. Export des données depuis SharePoint
# ---------------------------------------------------------------
if ($SansExport) {
    Etape "Export ignoré (-SansExport)"
} else {
    Etape "Export des données publiées"
    $script02 = Join-Path $PSScriptRoot "02-export-publication.ps1"
    $arguments = @{
        SiteUrl  = $SiteUrl
        ClientId = $ClientId
        Sortie   = $Sortie
    }
    if ($Interactif) { $arguments["Interactif"] = $true }
    else {
        $arguments["Thumbprint"] = $Thumbprint
        $arguments["Tenant"] = $Tenant
    }
    & $script02 @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "L'export a échoué (code $LASTEXITCODE). Publication interrompue."
    }
}

# ---------------------------------------------------------------
# 2. Copie du site par-dessus les données
# ---------------------------------------------------------------
Etape "Assemblage du site"
New-Item -ItemType Directory -Force -Path $Sortie | Out-Null

# Les données et les documents produits par le script 02 sont déjà
# dans $Sortie : on copie le site autour d'eux sans les écraser.
Copy-Item -Path (Join-Path $front "*.html") -Destination $Sortie -Force
Copy-Item -Path (Join-Path $front "assets") -Destination $Sortie -Recurse -Force
Ok "Pages et ressources copiées"

$fichierDonnees = Join-Path $Sortie "data\opportunites.json"
if (-not (Test-Path $fichierDonnees)) {
    throw "Aucune donnée publiée dans $fichierDonnees — le site serait vide."
}
$donnees = Get-Content $fichierDonnees -Raw | ConvertFrom-Json
$nbAO = @($donnees.appelsOffres).Count
$nbRH = @($donnees.recrutements).Count
Ok "$nbAO avis et $nbRH offres à publier"

# ---------------------------------------------------------------
# 3. Configuration de l'environnement
# ---------------------------------------------------------------
Etape "Configuration"
$candidatures = if ($AvecCandidatures) { "/api/candidatures" } else { "" }
$abonnements  = if ($AvecCandidatures) { "/api/abonnements" }  else { "" }

$configuration = @"
/* =================================================================
   AGEROUTE Guinée — Portail public des opportunités
   CONFIGURATION DE DÉPLOIEMENT

   Fichier engendré par 06-preparer-publication.ps1
   le $(Get-Date -Format 'yyyy-MM-dd HH:mm').
   Ne pas modifier à la main : relancer le script.

   Aucun secret ici. Les URL des déclencheurs Power Automate restent
   côté serveur, dans le relais (CDC §7.3).
   ================================================================= */

window.PORTAIL_CONFIG = {
  sourceDonnees: 'data/opportunites.json',
  pointEntreeCandidatures: '$candidatures',
  pointEntreeAbonnements: '$abonnements',
  racineDocuments: '',
  extensionsAutorisees: ['pdf', 'docx', 'jpg', 'jpeg', 'png'],
  tailleMaxFichierMo: 10,
  tailleMaxTotalMo: 30,
  cleCaptcha: '$CleCaptcha',
  seuilObsolescenceHeures: 6
};
"@
Set-Content -Path (Join-Path $Sortie "assets\config.js") -Value $configuration -Encoding UTF8

if ($AvecCandidatures) {
    Ok "Dépôt de candidature et abonnement actifs"
    if (-not $CleCaptcha) {
        Write-Warning "Aucune cle CAPTCHA fournie : le relais refusera les depots si la verification y est exigee."
    }
} else {
    Ok "Consultation seule — dépôt et abonnement masqués"
}

# ---------------------------------------------------------------
# 4. Contrôles avant mise en ligne
# ---------------------------------------------------------------
Etape "Contrôles"

# Aucune URL de déclencheur ne doit se retrouver dans ce qui part
# sur un serveur public.
$suspects = Get-ChildItem -Path $Sortie -Recurse -Include *.js, *.html, *.json |
    Select-String -Pattern "logic\.azure\.com|triggers/manual/paths/invoke" -List
if ($suspects) {
    $suspects | ForEach-Object { Write-Host "    $($_.Path)" -ForegroundColor Red }
    throw "Une URL de déclencheur Power Automate figure dans le dossier de publication. Mise en ligne interrompue."
}
Ok "Aucun secret dans le dossier"

if ($donnees.exemple -eq $true) {
    throw "Le fichier de données porte le marqueur « exemple » : ce sont des données de démonstration, elles ne doivent pas être publiées."
}
Ok "Données réelles (aucun marqueur de démonstration)"

$manquants = @("index.html", "confirmer.html", "desabonnement.html",
               "assets\portail.css", "assets\portail.js", "assets\config.js") |
    Where-Object { -not (Test-Path (Join-Path $Sortie $_)) }
if ($manquants) {
    throw "Fichiers manquants dans le dossier de publication : $($manquants -join ', ')"
}
Ok "Tous les fichiers attendus sont présents"

$poids = [math]::Round((Get-ChildItem $Sortie -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

Write-Host @"

=====================================================================
 DOSSIER PRET A METTRE EN LIGNE
=====================================================================
 Emplacement : $Sortie
 Contenu     : $nbAO avis, $nbRH offres, $poids Mo
 Mode        : $(if ($AvecCandidatures) { 'complet' } else { 'consultation seule' })

 DEPOT SUR L'HEBERGEMENT — selon la solution retenue :

   Serveur web de l'Agence (SFTP ou partage) :
     Deposer le contenu de $Sortie a la racine du site.

   Azure Static Web Apps :
     swa deploy "$Sortie" --env production

   Azure Storage + CDN :
     az storage blob upload-batch -s "$Sortie" -d `$web

 APRES LA PREMIERE MISE EN LIGNE
   1. Configurer HTTPS et la redirection HTTP vers HTTPS.
   2. Poser les en-tetes de securite (voir la configuration Nginx
      de reference dans services/integrations/relais-portail).
   3. Planifier ce script toutes les 15 minutes pour que les
      publications SharePoint remontent automatiquement.
=====================================================================
"@ -ForegroundColor Yellow
