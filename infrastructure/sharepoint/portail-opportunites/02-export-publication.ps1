<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 02 — Publication vers le front public (export JSON)
=====================================================================
 Rôle : extraire de SharePoint les contenus au statut « Publié »,
 « Clôturé », « Attribué », « Résultats publiés » ou « Archivé » et
 générer le fichier data/opportunites.json consommé par le site
 public, ainsi que la copie des documents publics (DAO, TDR,
 additifs, avis d'attribution).

 Réf. cahier des charges v2.0 — §3.3 (couche de publication)
 et WF-07 (synchronisation).

 Les dossiers de candidature ne sont JAMAIS exportés : la
 bibliothèque et la liste correspondantes sont hors du périmètre
 de ce script (EXG-25).

 EXÉCUTION RECOMMANDÉE
   - Azure Automation / runbook planifié toutes les 15 minutes,
     OU déclenché par le flux WF-07 (webhook) après publication.
   - Identité : application Entra ID avec certificat (aucun
     compte nominatif), autorisation Sites.Selected limitée au site.

 USAGE
   .\02-export-publication.ps1 `
      -SiteUrl   "https://ageroute.sharepoint.com/sites/AGR-PRT-Opportunites" `
      -ClientId  "<GUID>" -Thumbprint "<empreinte certificat>" `
      -Tenant    "ageroute.onmicrosoft.com" `
      -Sortie    "C:\publication\www"

 Code de sortie : 0 si l'export a abouti, 1 sinon (le runbook et le
 contrôle quotidien CDC §9.2 s'appuient dessus).
=====================================================================
#>
param(
    [Parameter(Mandatory=$true)] [string] $SiteUrl,
    [Parameter(Mandatory=$true)] [string] $ClientId,
    [Parameter(Mandatory=$true)] [string] $Thumbprint,
    [Parameter(Mandatory=$true)] [string] $Tenant,
    [Parameter(Mandatory=$true)] [string] $Sortie,
    [switch] $SansDocuments
)
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------
# Lecture défensive : un champ vide ne doit pas interrompre tout
# l'export. Une publication incomplète vaut mieux qu'un portail
# figé sur des données de la veille.
# ---------------------------------------------------------------
function ValeurTexte($item, $champ) {
    $v = $item[$champ]
    if ($null -eq $v) { return $null }
    return [string]$v
}
function ValeurEtiquette($item, $champ) {
    $v = $item[$champ]
    if ($null -eq $v) { return $null }
    if ($v.PSObject.Properties.Name -contains "Label") { return $v.Label }
    return [string]$v
}
function ValeurUrl($item, $champ) {
    $v = $item[$champ]
    if ($null -eq $v) { return $null }
    if ($v.PSObject.Properties.Name -contains "Url") { return $v.Url }
    return [string]$v
}
function ValeurDate($item, $champ, $format) {
    $v = $item[$champ]
    if ($null -eq $v -or "$v" -eq "") { return $null }
    try { return ([datetime]$v).ToString($format) } catch { return $null }
}
function TexteBrut($valeur) {
    if ($null -eq $valeur) { return "" }
    # Les descriptions saisies en champ enrichi arrivent en HTML.
    $sansBalises = [regex]::Replace([string]$valeur, '<[^>]+>', ' ')
    $decode = [System.Net.WebUtility]::HtmlDecode($sansBalises)
    return ([regex]::Replace($decode, '\s+', ' ')).Trim()
}

$maintenant = Get-Date
$journal = Join-Path $Sortie "journal-synchronisation.log"

try {
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Thumbprint $Thumbprint -Tenant $Tenant

    $statutsPublicsAO = @("Publié","Clôturé","Attribué","Archivé")
    $statutsPublicsRH = @("Publié","Clôturé","Résultats publiés","Archivé")

    # ------------------- Appels d'offres -------------------
    $ao = @(Get-PnPListItem -List "Liste-AppelsOffres" -PageSize 500 | Where-Object {
        $statutsPublicsAO -contains (ValeurTexte $_ "StatutAO")
    } | ForEach-Object {
        [ordered]@{
            ref      = ValeurTexte $_ "ReferenceAO"
            titre    = ValeurTexte $_ "Title"
            desc     = TexteBrut (ValeurTexte $_ "DescriptionAO")
            type     = ValeurTexte $_ "TypeMarche"
            region   = ValeurEtiquette $_ "RegionAO"
            bailleur = ValeurEtiquette $_ "BailleurAO"
            pub      = ValeurDate $_ "DatePublication" "yyyy-MM-dd"
            cloture  = ValeurDate $_ "DateCloture" "yyyy-MM-ddTHH:mm"
            statut   = ValeurTexte $_ "StatutAO"
            dao      = ValeurUrl $_ "LienDAO"
            resultat = ValeurUrl $_ "LienResultat"
        }
    })

    # ------------------- Recrutements -------------------
    $rh = @(Get-PnPListItem -List "Liste-Recrutements" -PageSize 500 | Where-Object {
        $statutsPublicsRH -contains (ValeurTexte $_ "StatutRH")
    } | ForEach-Object {
        [ordered]@{
            ref       = ValeurTexte $_ "ReferenceRH"
            titre     = ValeurTexte $_ "Title"
            desc      = TexteBrut (ValeurTexte $_ "DescriptionRH")
            type      = ValeurTexte $_ "TypeContrat"
            direction = ValeurEtiquette $_ "DirectionRH"
            lieu      = ValeurEtiquette $_ "LieuRH"
            pub       = ValeurDate $_ "DatePublication" "yyyy-MM-dd"
            cloture   = ValeurDate $_ "DateLimite" "yyyy-MM-ddTHH:mm"
            statut    = ValeurTexte $_ "StatutRH"
            tdr       = ValeurUrl $_ "LienTDR"
        }
    })

    # Une entrée sans référence ni date de clôture serait
    # inexploitable par le front : on l'écarte et on le signale.
    $aoValides = @($ao | Where-Object { $_.ref -and $_.cloture })
    $rhValides = @($rh | Where-Object { $_.ref -and $_.cloture })
    $ecartes = ($ao.Count - $aoValides.Count) + ($rh.Count - $rhValides.Count)
    if ($ecartes -gt 0) {
        Write-Warning "$ecartes élément(s) écarté(s) : référence ou date de clôture manquante."
    }

    # ------------------- Statistiques du tableau de bord -------------------
    $dansUneSemaine = $maintenant.AddDays(7)
    $ouvertsAO = @($aoValides | Where-Object { $_.statut -eq "Publié" })
    $ouvertsRH = @($rhValides | Where-Object { $_.statut -eq "Publié" })

    $stats = [ordered]@{
        aoOuverts        = $ouvertsAO.Count
        rhOuverts        = $ouvertsRH.Count
        daoDisponibles   = @($aoValides | Where-Object { $_.dao }).Count
        cloturesSemaine  = @(($ouvertsAO + $ouvertsRH) | Where-Object {
                               try { [datetime]$_.cloture -le $dansUneSemaine } catch { $false }
                           }).Count
        marchesAttribues = @($aoValides | Where-Object { $_.statut -eq "Attribué" }).Count
        recrutTermines   = @($rhValides | Where-Object { $_.statut -eq "Résultats publiés" }).Count
    }

    # ------------------- Génération du JSON -------------------
    $paquet = [ordered]@{
        genereLe     = $maintenant.ToString("s")
        stats        = $stats
        appelsOffres = $aoValides
        recrutements = $rhValides
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $Sortie "data") | Out-Null

    # Écriture atomique : le front ne doit jamais lire un fichier
    # à moitié écrit pendant la synchronisation.
    $cible = Join-Path $Sortie "data\opportunites.json"
    $temporaire = "$cible.tmp"
    $paquet | ConvertTo-Json -Depth 6 | Out-File $temporaire -Encoding utf8
    Move-Item -Path $temporaire -Destination $cible -Force

    Write-Host "[OK] $($aoValides.Count) AO et $($rhValides.Count) offres exportés vers $cible"

    # ------------------- Copie des documents publics -------------------
    if (-not $SansDocuments) {
        foreach ($bib in @("AppelsOffres","DAO","Additifs","Attributions","RecrutementTDR")) {
            $dest = Join-Path $Sortie "documents\$bib"
            New-Item -ItemType Directory -Force -Path $dest | Out-Null
            $copies = 0
            Get-PnPListItem -List $bib -PageSize 500 |
                Where-Object { $_.FileSystemObjectType -eq "File" } |
                ForEach-Object {
                    try {
                        Get-PnPFile -Url $_["FileRef"] -Path $dest `
                                    -FileName $_["FileLeafRef"] -AsFile -Force
                        $copies++
                    } catch {
                        Write-Warning "Copie impossible : $($_.Exception.Message)"
                    }
                }
            Write-Host "[OK] Bibliothèque $bib copiée ($copies fichiers)"
        }
    }

    # ------------------- Journal de synchronisation -------------------
    "$($maintenant.ToString('s')) ; AO=$($aoValides.Count) ; RH=$($rhValides.Count) ; ecartes=$ecartes ; OK" |
        Out-File $journal -Append -Encoding utf8
    exit 0
}
catch {
    $message = $_.Exception.Message -replace "[\r\n]+", " "
    try {
        New-Item -ItemType Directory -Force -Path $Sortie | Out-Null
        "$($maintenant.ToString('s')) ; ECHEC ; $message" | Out-File $journal -Append -Encoding utf8
    } catch { }
    Write-Error "Export interrompu : $message"
    exit 1
}

<#
 DÉPLOIEMENT DU DOSSIER $Sortie
 Selon l'hébergement de ageroute.gov.gn :
   - rsync / SFTP vers le serveur web, OU
   - commit dans le dépôt Git du site et pipeline CI/CD, OU
   - Azure Static Web Apps / stockage + CDN.
 Le code de sortie et le journal permettent au contrôle quotidien
 (CDC §9.2) de lever une alerte DSI en cas d'échec.
#>
