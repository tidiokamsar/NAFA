<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 08 — Import du jeu d'archives dans SharePoint
=====================================================================
 Verse dans les listes de gestion les avis réels de l'Agence réunis
 dans apps/web/portail-opportunites/archives/, et téléverse les PDF
 officiels dans les bibliothèques DAO et RecrutementTDR.

 À quoi ça sert : le back-office ne contient aujourd'hui que le jeu
 de recette. Une fois ces avis versés, la chaîne normale — export,
 dépôt, portail — publie du contenu véritable sans qu'on ait rien à
 déposer à la main.

 ---------------------------------------------------------------
 DEUX CONTRAINTES DU SCHÉMA, ET COMMENT ELLES SONT TRAITÉES
 ---------------------------------------------------------------
 1. La colonne Référence impose AO/AAAA/NNN — onze caractères. Les
    références officielles ne s'y plient pas : « AOON N° 002T/DAO/
    AGEROUTE/DMC/2026 » en fait trente-quatre. Le script attribue
    donc une référence conforme, et reporte la référence officielle
    en tête de la description. Rien n'est perdu, rien n'est inventé.

 2. Type de marché, type de contrat, région, bailleur et direction
    sont des listes fermées ou des jeux de termes. Quand la valeur
    de l'archive n'y figure pas telle quelle, le champ est laissé
    VIDE et le script le signale. Deviner « CDI » là où l'avis ne
    dit rien serait fabriquer une information sur un portail public.

 ---------------------------------------------------------------
 USAGE
 ---------------------------------------------------------------
   # Voir ce qui serait fait, sans rien écrire
   .\08-importer-archives.ps1 -SiteUrl "https://...-Recette" `
      -ClientId "<GUID>" -Interactif -Simulation

   # Import réel
   .\08-importer-archives.ps1 -SiteUrl "https://...-Recette" `
      -ClientId "<GUID>" -Interactif

 Idempotent : un avis déjà présent (même titre) est ignoré.
 Réversible : -Retirer supprime ce que ce script a versé.
=====================================================================
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [string] $Thumbprint,
    [string] $Tenant,
    [switch] $Interactif,
    [switch] $Simulation,
    [switch] $Retirer,
    [string] $Archives
)

$ErrorActionPreference = "Stop"
function Etape($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "    [OK] $m"    -ForegroundColor Green }
function Info($m)  { Write-Host "    $m"         -ForegroundColor DarkGray }
function Alerte($m){ Write-Host "    [!] $m"     -ForegroundColor Yellow }

# Windows PowerShell 5.1 est encore le shell par défaut de Windows et
# la confusion est facile : la fenêtre bleue « Windows PowerShell » et
# la noire « pwsh » se ressemblent. PnP.PowerShell 2.x ne tourne que
# sur la seconde, et l'erreur qu'on obtient sans ce contrôle survient
# bien plus tard, sous une forme incompréhensible.
if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw ("PnP.PowerShell 2.x exige PowerShell 7 ; cette session est en " +
           "$($PSVersionTable.PSVersion). Fermer cette fenêtre, ouvrir « pwsh » " +
           "et relancer. Installation : winget install --id Microsoft.PowerShell")
}

if (-not $Interactif -and (-not $Thumbprint -or -not $Tenant)) {
    throw "Fournir -Thumbprint et -Tenant, ou -Interactif."
}

# Le dossier d'archives vit quatre niveaux plus haut, dans le front.
if (-not $Archives) {
    # Segments séparés plutôt qu'un chemin à antislashes : Join-Path
    # pose le séparateur de la plateforme, et le chemin reste vérifiable
    # ailleurs que sous Windows.
    $racine = Resolve-Path (Join-Path $PSScriptRoot ".." ".." "..")
    $Archives = Join-Path $racine "apps" "web" "portail-opportunites" "archives"
}
$fichier = Join-Path $Archives "data" "opportunites.json"
if (-not (Test-Path $fichier)) { throw "Jeu d'archives introuvable : $fichier" }

$paquet = Get-Content $fichier -Raw -Encoding UTF8 | ConvertFrom-Json
$lesAO  = @($paquet.appelsOffres)
$lesRH  = @($paquet.recrutements)
Info "Archives lues : $($lesAO.Count) appel(s) d'offres, $($lesRH.Count) recrutement(s)"

# Listes fermées du schéma (01-provision-sharepoint.ps1).
$typesMarche  = @("Travaux","Fournitures","Services","Prestations intellectuelles")
$typesContrat = @("CDI","CDD","Consultant","Stage")
$statutsAO    = @("Brouillon","En validation","Publié","Clôturé","Attribué","Annulé","Archivé")
$statutsRH    = @("Brouillon","En validation","Publié","Clôturé","Résultats publiés","Archivé")

$nonRepris = New-Object System.Collections.Generic.List[string]

function ChoixValide($valeur, $permis, $etiquette, $titre) {
    if ($valeur -and ($permis -contains $valeur)) { return $valeur }
    # Normalisation étroite, et seulement quand la source dit déjà la
    # chose : « CDD 12 mois » commence par « CDD », l'avis qualifie donc
    # bien un CDD. On ne retient que le préfixe suivi d'une espace, ce
    # qui écarte « Cadre de direction », qui n'est pas un type de contrat.
    if ($valeur) {
        foreach ($c in $permis) {
            if ($valeur.StartsWith("$c ", [StringComparison]::OrdinalIgnoreCase)) {
                $script:nonRepris.Add("$etiquette « $valeur » ramené à « $c » pour « $titre ».")
                return $c
            }
        }
    }
    if ($valeur) {
        $script:nonRepris.Add("$etiquette « $valeur » hors liste pour « $titre » — champ laissé vide.")
    }
    return $null
}

Etape "Connexion"
if ($Interactif) { Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive }
else             { Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Thumbprint $Thumbprint -Tenant $Tenant }
Ok "Connecté à $SiteUrl"

# ---------------------------------------------------------------
if ($Retirer) {
    Etape "Retrait des avis importés"
    foreach ($couple in @(@{L="Liste-AppelsOffres"; S=$lesAO}, @{L="Liste-Recrutements"; S=$lesRH})) {
        foreach ($x in $couple.S) {
            $item = Get-PnPListItem -List $couple.L -PageSize 500 |
                    Where-Object { $_.FieldValues["Title"] -eq $x.titre } | Select-Object -First 1
            if ($item) {
                if ($Simulation) { Info "SIMULATION — supprimerait « $($x.titre) »" }
                else { Remove-PnPListItem -List $couple.L -Identity $item.Id -Force | Out-Null; Ok "Supprimé : $($x.titre)" }
            }
        }
    }
    Disconnect-PnPOnline
    return
}

# ---------------------------------------------------------------
Etape "Téléversement des pièces officielles"

# Chemin local -> URL relative au site, pour alimenter LienDAO / LienTDR.
$urlDesPieces = @{}
$dossierDocs = Join-Path $Archives "documents"
if (Test-Path $dossierDocs) {
    foreach ($f in Get-ChildItem $dossierDocs -Recurse -File -Filter *.pdf) {
        # documents/AvisMarches/x.pdf -> bibliothèque DAO
        # documents/RecrutementTDR/x.pdf -> bibliothèque RecrutementTDR
        $biblio = if ($f.Directory.Name -eq "AvisMarches") { "DAO" } else { "RecrutementTDR" }
        $cle = "documents/$($f.Directory.Name)/$($f.Name)"
        if ($Simulation) {
            Info "SIMULATION — téléverserait $($f.Name) dans $biblio"
            $urlDesPieces[$cle] = "/$biblio/$($f.Name)"
        } else {
            $depose = Add-PnPFile -Path $f.FullName -Folder $biblio -ErrorAction Stop
            $urlDesPieces[$cle] = $depose.ServerRelativeUrl
            Ok "$($f.Name) → $biblio"
        }
    }
} else {
    Alerte "Aucun dossier documents/ dans les archives : les liens resteront vides."
}

# ---------------------------------------------------------------
Etape "Appels d'offres"

$numero = 0
foreach ($x in $lesAO) {
    $numero++
    $existe = Get-PnPListItem -List "Liste-AppelsOffres" -PageSize 500 |
              Where-Object { $_.FieldValues["Title"] -eq $x.titre } | Select-Object -First 1
    if ($existe) { Info "Déjà présent, ignoré : $($x.titre)"; continue }

    $reference = "AO/2026/{0:D3}" -f (900 + $numero)   # série 9xx réservée aux archives
    $description = "Référence officielle : $($x.ref)`n`n$($x.desc)"

    $valeurs = @{
        "Title"           = $x.titre
        "ReferenceAO"     = $reference
        "DescriptionAO"   = $description
        "StatutAO"        = (ChoixValide $x.statut $statutsAO "Statut" $x.titre)
        "DatePublication" = $x.pub
    }
    $t = ChoixValide $x.type $typesMarche "Type de marché" $x.titre
    if ($t) { $valeurs["TypeMarche"] = $t }
    if ($x.cloture) { $valeurs["DateCloture"] = $x.cloture }
    else { $nonRepris.Add("Aucune date de clôture publiée pour « $($x.titre) » — champ laissé vide.") }
    if ($x.dao -and $urlDesPieces.ContainsKey($x.dao)) {
        $valeurs["LienDAO"] = $urlDesPieces[$x.dao]
    }
    $valeurs = $valeurs.GetEnumerator() | Where-Object { $null -ne $_.Value } |
               ForEach-Object -Begin { $h = @{} } -Process { $h[$_.Key] = $_.Value } -End { $h }

    if ($Simulation) {
        Info "SIMULATION — créerait $reference : $($x.titre)"
    } else {
        Add-PnPListItem -List "Liste-AppelsOffres" -Values $valeurs | Out-Null
        Ok "$reference — $($x.titre)"
    }
}

# ---------------------------------------------------------------
Etape "Recrutements"

$numero = 0
foreach ($x in $lesRH) {
    $numero++
    $existe = Get-PnPListItem -List "Liste-Recrutements" -PageSize 500 |
              Where-Object { $_.FieldValues["Title"] -eq $x.titre } | Select-Object -First 1
    if ($existe) { Info "Déjà présent, ignoré : $($x.titre)"; continue }

    $reference = "RH/2026/{0:D3}" -f (900 + $numero)
    $description = "Référence officielle : $($x.ref)`n`n$($x.desc)"

    $valeurs = @{
        "Title"           = $x.titre
        "ReferenceRH"     = $reference
        "DescriptionRH"   = $description
        "StatutRH"        = (ChoixValide $x.statut $statutsRH "Statut" $x.titre)
        "DatePublication" = $x.pub
    }
    $t = ChoixValide $x.type $typesContrat "Type de contrat" $x.titre
    if ($t) { $valeurs["TypeContrat"] = $t }
    if ($x.cloture) { $valeurs["DateLimite"] = $x.cloture }
    else { $nonRepris.Add("Aucune date limite publiée pour « $($x.titre) » — champ laissé vide.") }
    if ($x.tdr -and $urlDesPieces.ContainsKey($x.tdr)) {
        $valeurs["LienTDR"] = $urlDesPieces[$x.tdr]
    }
    $valeurs = $valeurs.GetEnumerator() | Where-Object { $null -ne $_.Value } |
               ForEach-Object -Begin { $h = @{} } -Process { $h[$_.Key] = $_.Value } -End { $h }

    if ($Simulation) {
        Info "SIMULATION — créerait $reference : $($x.titre)"
    } else {
        Add-PnPListItem -List "Liste-Recrutements" -Values $valeurs | Out-Null
        Ok "$reference — $($x.titre)"
    }
}

Disconnect-PnPOnline

# ---------------------------------------------------------------
Etape "Bilan"

if ($nonRepris.Count -eq 0) {
    Ok "Tous les champs de l'archive ont trouvé leur place."
} else {
    Alerte "$($nonRepris.Count) champ(s) laissé(s) vide(s) — à compléter par un agent :"
    foreach ($m in $nonRepris) { Info "- $m" }
    Info ""
    Info "Ces valeurs ne sont pas devinées : l'avis d'origine ne les donne pas,"
    Info "ou sous une forme que la liste fermée n'accepte pas. Un champ vide se"
    Info "corrige ; une valeur inventée sur un portail de marchés, non."
}

Info ""
Info "Les régions, bailleurs et directions sont des jeux de termes : ce script"
Info "ne les renseigne pas. Les compléter dans SharePoint améliore les filtres"
Info "du portail, mais rien ne dépend d'eux pour publier."
Info ""
Info "Étape suivante : .\02-export-publication.ps1 pour publier vers le portail."
