<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 03 — Jeu d'essai de recette
=====================================================================
 Crée quelques avis et offres de test couvrant les états que le site
 public sait afficher : ouvert, clôture proche, attribué, résultats
 publiés. Sert à éprouver la chaîne complète — SharePoint, export,
 affichage — avant de construire les flux Power Automate.

 À N'UTILISER QUE SUR L'ENVIRONNEMENT DE RECETTE. Le script refuse
 de s'exécuter sur une URL qui ne comporte pas « Recette », sauf
 -ForcerProduction.

 USAGE
   .\03-jeu-essai.ps1 `
      -SiteUrl "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites-Recette" `
      -ClientId "<GUID>"

   .\03-jeu-essai.ps1 -SiteUrl "..." -ClientId "..." -Supprimer

 Idempotent : un élément dont la référence existe déjà n'est pas
 recréé.
=====================================================================
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [switch] $Supprimer,
    [switch] $ForcerProduction
)

$ErrorActionPreference = "Stop"
function Etape($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "    [OK] $m" -ForegroundColor Green }
function Info($m)  { Write-Host "    $m" -ForegroundColor DarkGray }

# Le garde-fou protège l'INSERTION de données de test hors recette.
# Il ne doit pas protéger leur retrait : nettoyer de la recette
# égarée en production est exactement ce qu'on veut pouvoir faire
# sans cérémonie.
if (-not $Supprimer -and $SiteUrl -notmatch "Recette" -and -not $ForcerProduction) {
    throw "Ce script insère des données de test. L'URL ne comporte pas " +
          "« Recette » — utiliser -ForcerProduction pour passer outre."
}

$maintenant = Get-Date

# Sur un poste en français, la conversion implicite d'une date produit
# « 29/07/2026 10:15:00 », que SharePoint refuse. On impose donc le
# format ISO 8601 en UTC, indépendant de la culture du poste.
function DateIso($d) {
    return $d.ToUniversalTime().ToString(
        "yyyy-MM-ddTHH:mm:ss'Z'", [System.Globalization.CultureInfo]::InvariantCulture)
}

$avis = @(
    @{ Ref = "AO/2026/001"; Titre = "Essai — Bitumage de la RN1, section Coyah-Kindia"
       Desc = "Avis de test : travaux de bitumage sur 42 km, y compris assainissement et signalisation."
       Type = "Travaux"; Cloture = $maintenant.AddDays(30); Statut = "Publié" },
    @{ Ref = "AO/2026/002"; Titre = "Essai — Fourniture de panneaux de signalisation"
       Desc = "Avis de test dont la clôture est proche : le site doit l'afficher en « Clôture proche »."
       Type = "Fournitures"; Cloture = $maintenant.AddDays(4); Statut = "Publié" },
    @{ Ref = "AO/2026/003"; Titre = "Essai — Entretien courant du réseau de Kankan"
       Desc = "Avis de test déjà attribué : le site doit l'afficher en « Attribué »."
       Type = "Travaux"; Cloture = $maintenant.AddDays(-20); Statut = "Attribué" }
)

$offres = @(
    @{ Ref = "RH/2026/001"; Titre = "Essai — Ingénieur routier"
       Desc = "Offre de test ouverte : le bouton de dépôt de candidature doit être proposé."
       Type = "CDD"; Limite = $maintenant.AddDays(20); Statut = "Publié" },
    @{ Ref = "RH/2026/002"; Titre = "Essai — Assistant de direction"
       Desc = "Offre de test dont les résultats sont publiés : aucun dépôt ne doit être possible."
       Type = "CDI"; Limite = $maintenant.AddDays(-15); Statut = "Résultats publiés" }
)

Etape "Connexion"
Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
Ok $SiteUrl

function ElementParReference($liste, $champ, $reference) {
    # La recherche par filtre OData s'appuie sur les colonnes indexées
    # posées par le script 01.
    Get-PnPListItem -List $liste -Query @"
<View><Query><Where><Eq><FieldRef Name='$champ'/><Value Type='Text'>$reference</Value></Eq></Where></Query></View>
"@ -ErrorAction SilentlyContinue | Select-Object -First 1
}

if ($Supprimer) {
    Etape "Suppression du jeu d'essai"
    foreach ($a in $avis) {
        $item = ElementParReference "Liste-AppelsOffres" "ReferenceAO" $a.Ref
        if ($item) { Remove-PnPListItem -List "Liste-AppelsOffres" -Identity $item.Id -Force | Out-Null; Ok "Supprimé $($a.Ref)" }
        else { Info "$($a.Ref) absent" }
    }
    foreach ($o in $offres) {
        $item = ElementParReference "Liste-Recrutements" "ReferenceRH" $o.Ref
        if ($item) { Remove-PnPListItem -List "Liste-Recrutements" -Identity $item.Id -Force | Out-Null; Ok "Supprimé $($o.Ref)" }
        else { Info "$($o.Ref) absent" }
    }
    Write-Host "`nJeu d'essai retiré." -ForegroundColor Yellow
    return
}

Etape "Appels d'offres"
foreach ($a in $avis) {
    if (ElementParReference "Liste-AppelsOffres" "ReferenceAO" $a.Ref) {
        Info "$($a.Ref) existe déjà"
        continue
    }
    Add-PnPListItem -List "Liste-AppelsOffres" -Values @{
        Title           = $a.Titre
        ReferenceAO     = $a.Ref
        DescriptionAO   = $a.Desc
        TypeMarche      = $a.Type
        DatePublication = DateIso $maintenant
        DateCloture     = DateIso $a.Cloture
        StatutAO        = $a.Statut
    } | Out-Null
    Ok "$($a.Ref) — $($a.Statut)"
}

Etape "Recrutements"
foreach ($o in $offres) {
    if (ElementParReference "Liste-Recrutements" "ReferenceRH" $o.Ref) {
        Info "$($o.Ref) existe déjà"
        continue
    }
    Add-PnPListItem -List "Liste-Recrutements" -Values @{
        Title           = $o.Titre
        ReferenceRH     = $o.Ref
        DescriptionRH   = $o.Desc
        TypeContrat     = $o.Type
        DatePublication = DateIso $maintenant
        DateLimite      = DateIso $o.Limite
        StatutRH        = $o.Statut
    } | Out-Null
    Ok "$($o.Ref) — $($o.Statut)"
}

Write-Host @"

=====================================================================
 JEU D'ESSAI EN PLACE — 3 avis, 2 offres
=====================================================================
 Exporter, puis afficher :

   .\02-export-publication.ps1 -SiteUrl "$SiteUrl" ``
       -ClientId "$ClientId" -Interactif -Sortie "C:\publication\recette"

 Pour retirer ces données :
   .\03-jeu-essai.ps1 -SiteUrl "$SiteUrl" -ClientId "$ClientId" -Supprimer
=====================================================================
"@ -ForegroundColor Yellow
