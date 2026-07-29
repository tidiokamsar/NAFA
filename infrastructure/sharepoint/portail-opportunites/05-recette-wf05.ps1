<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 05 — Recette automatisée du flux WF-05
=====================================================================
 Exécute les essais du CDC §12.2 directement contre le déclencheur
 HTTP de WF-05, sans passer par le relais. C'est le point important :
 le relais applique déjà ces contrôles, donc les tester à travers lui
 ne prouverait rien sur le flux. Ici, le flux est seul en cause.

 Les essais 1 à 6 ne créent rien. L'essai 7 dépose une vraie
 candidature de test et n'est joué qu'avec -AvecDepotReel.

 USAGE
   .\05-recette-wf05.ps1 `
      -UrlFlux "<url du declencheur WF-05>" `
      -ClePartagee "<cle du coffre>" `
      -OffreOuverte "RH/2026/001" -OffreCloturee "RH/2026/002"

 Code de sortie : 0 si tous les essais joués passent, 1 sinon.
=====================================================================
#>
param(
    [Parameter(Mandatory = $true)] [string] $UrlFlux,
    [Parameter(Mandatory = $true)] [string] $ClePartagee,
    [string] $OffreOuverte = "RH/2026/001",
    [string] $OffreCloturee = "RH/2026/002",
    [string] $EnteteCle = "x-cle-relais",
    [switch] $AvecDepotReel
)

$ErrorActionPreference = "Stop"
$echecs = 0
$joues  = 0

function Titre($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

function Base64DeTaille([int] $octets) {
    return [Convert]::ToBase64String((New-Object byte[] $octets))
}

function Appeler($corps, $avecCle = $true, $cle = $null) {
    $entetes = @{ "Content-Type" = "application/json" }
    if ($avecCle) { $entetes[$EnteteCle] = if ($cle) { $cle } else { $ClePartagee } }
    try {
        return Invoke-WebRequest -Uri $UrlFlux -Method Post -Headers $entetes `
            -Body ($corps | ConvertTo-Json -Depth 6) `
            -SkipHttpErrorCheck -TimeoutSec 120
    } catch {
        return [pscustomobject]@{ StatusCode = -1; Content = $_.Exception.Message }
    }
}

function Essai($numero, $intitule, $exigence, $attendu, $reponse) {
    $script:joues++
    $obtenu = $reponse.StatusCode
    $conforme = ($obtenu -eq $attendu)
    if (-not $conforme) { $script:echecs++ }

    $couleur = if ($conforme) { "Green" } else { "Red" }
    $marque  = if ($conforme) { "[OK]  " } else { "[ECHEC]" }
    Write-Host ("{0} {1}. {2}" -f $marque, $numero, $intitule) -ForegroundColor $couleur
    Write-Host ("        {0} — attendu {1}, obtenu {2}" -f $exigence, $attendu, $obtenu) -ForegroundColor DarkGray
    if (-not $conforme -and $reponse.Content) {
        $extrait = ([string]$reponse.Content) -replace '[\r\n]+', ' '
        Write-Host ("        Réponse : {0}" -f $extrait.Substring(0, [Math]::Min(200, $extrait.Length))) -ForegroundColor DarkGray
    }
}

function Candidature($modifications = @{}) {
    $base = @{
        offreRef     = $OffreOuverte
        nom          = "Recette"
        prenom       = "Automatisee"
        courriel     = "recette-portail@ageroute.gov.gn"
        telephone    = "+224 622 00 00 00"
        consentement = $true
        pieces       = @(@{ nom = "CV.pdf"; contenuBase64 = (Base64DeTaille 2048) })
    }
    foreach ($cle in $modifications.Keys) { $base[$cle] = $modifications[$cle] }
    return $base
}

Write-Host @"

  RECETTE DU FLUX WF-05
  Déclencheur : $($UrlFlux -replace '(sig=)[^&]+', '$1<masque>')
  Offre ouverte : $OffreOuverte
  Offre clôturée : $OffreCloturee

"@ -ForegroundColor Yellow

# ---------------------------------------------------------------
Titre "Contrôle d'accès"

Essai 1 "Appel sans clé partagée" "CDC §7.3" 401 (Appeler (Candidature) $false)
Essai 2 "Appel avec une clé erronée" "CDC §7.3" 401 (Appeler (Candidature) $true "cle-invalide")

# ---------------------------------------------------------------
Titre "Contrôles serveur"

Essai 3 "Consentement absent" "EXG-23" 400 (Appeler (Candidature @{ consentement = $false }))

Essai 4 "Pièce au format interdit (.exe)" "EXG-22" 400 (Appeler (Candidature @{
    pieces = @(@{ nom = "malveillant.exe"; contenuBase64 = (Base64DeTaille 1024) })
}))

Essai 5 "Pièce de plus de 10 Mo" "EXG-22" 400 (Appeler (Candidature @{
    pieces = @(@{ nom = "CV.pdf"; contenuBase64 = (Base64DeTaille (11 * 1024 * 1024)) })
}))

Essai 6 "Dépôt sur une offre clôturée" "EXG-26" 409 (Appeler (Candidature @{
    offreRef = $OffreCloturee
}))

# ---------------------------------------------------------------
Titre "Dépôt conforme"

if ($AvecDepotReel) {
    $reponse = Appeler (Candidature)
    Essai 7 "Dépôt conforme sur une offre ouverte" "EXG-24" 200 $reponse

    if ($reponse.StatusCode -eq 200) {
        try {
            $corps = $reponse.Content | ConvertFrom-Json
            if ($corps.dossier -match '^CAND-\d{4}-\d{5}$') {
                Write-Host "        Numéro de dossier : $($corps.dossier)" -ForegroundColor Green
            } else {
                Write-Host "        [ECHEC] Numéro de dossier absent ou mal formé : $($corps.dossier)" -ForegroundColor Red
                $echecs++
            }
        } catch {
            Write-Host "        [ECHEC] Réponse illisible : le flux doit renvoyer { `"dossier`": `"...`" }" -ForegroundColor Red
            $echecs++
        }
    }
} else {
    Write-Host "  (ignoré — relancer avec -AvecDepotReel pour déposer une candidature de test)" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------
Write-Host "`n====================================================================="
if ($echecs -eq 0) {
    Write-Host " RECETTE WF-05 : $joues essai(s), tous conformes." -ForegroundColor Green
    if (-not $AvecDepotReel) {
        Write-Host " Le depot reel n'a pas ete joue. Relancer avec -AvecDepotReel," -ForegroundColor Yellow
        Write-Host " puis verifier dans SharePoint : dossier cree dans la" -ForegroundColor Yellow
        Write-Host " bibliotheque Candidatures, element dans Liste-Candidatures," -ForegroundColor Yellow
        Write-Host " accuse de reception recu par courriel." -ForegroundColor Yellow
    }
    Write-Host "====================================================================="
    exit 0
} else {
    Write-Host " RECETTE WF-05 : $echecs echec(s) sur $joues essai(s)." -ForegroundColor Red
    Write-Host " Se reporter a CONSTRUCTION-WF-05-PAS-A-PAS.md, section" -ForegroundColor Red
    Write-Host " correspondant a l'essai en echec." -ForegroundColor Red
    Write-Host "====================================================================="
    exit 1
}
