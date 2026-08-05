<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 07 — Mise en service complète, en une commande
=====================================================================
 Enchaîne tout ce qui reste entre un poste connecté au tenant et un
 portail qui se nourrit tout seul :

   1. contrôle des prérequis (PowerShell 7, PnP.PowerShell) ;
   2. application Entra ID — réutilisée si fournie, créée sinon ;
   3. provisionnement du back-office (script 01) ;
   4. peuplement des groupes de sécurité (script 04) ;
   5. retrait du jeu de recette, sur demande (script 03) ;
   6. export des publications (script 02) ;
   7. assemblage du dossier à mettre en ligne (script 06) ;
   8. dépôt sur le serveur, si une commande est fournie ;
   9. planification de la répétition (tâche Windows).

 Idempotent : relançable sans dommage. Chaque étape peut être sautée.

 ---------------------------------------------------------------
 CE QUE CE SCRIPT NE PEUT PAS FAIRE
 ---------------------------------------------------------------
 - Construire les flux Power Automate. Aucune API ne les crée de
   façon fiable sans les tester sur le tenant ; la marche à suivre
   reste CONSTRUCTION-FLUX-POWER-AUTOMATE.md.
 - Deviner comment déposer les fichiers sur le serveur. Fournir
   -CommandeDepot (scp, rsync, robocopy, ce que vous voulez).
 - Rendre la tâche planifiée autonome sans certificat. Une tâche
   qui tourne sans personne devant l'écran ne peut pas ouvrir de
   fenêtre de connexion : il lui faut -Thumbprint. Sans lui, le
   script le dit et n'installe pas la tâche.

 ---------------------------------------------------------------
 USAGE — première mise en service, recette
 ---------------------------------------------------------------
   .\07-mise-en-service.ps1 -Tenant "ageroutegn" `
      -Habilitations ".\habilitations.csv"

 ---------------------------------------------------------------
 USAGE — production, chaîne complète et autonome
 ---------------------------------------------------------------
   .\07-mise-en-service.ps1 -Tenant "ageroutegn" -Production `
      -ClientId "<GUID>" -Thumbprint "<empreinte>" `
      -Habilitations "C:\hab\habilitations.csv" `
      -Sortie "C:\publication\www" `
      -CommandeDepot 'scp -r -i C:\cles\portail C:\publication\www\* depot@102.211.199.131:/opt/portail-opportunites/www/' `
      -SansJeuEssai -Planifier
=====================================================================
#>
param(
    [Parameter(Mandatory = $true)] [string] $Tenant,
    [string] $ClientId,
    [string] $Thumbprint,
    [switch] $Production,
    [string] $Habilitations,
    [string] $Sortie = "C:\publication\www",
    [string] $CommandeDepot,
    [switch] $SansJeuEssai,
    [switch] $Planifier,
    [int]    $IntervalleMinutes = 15,
    [switch] $SauterProvisionnement
)

$ErrorActionPreference = "Stop"

function Titre($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "    [OK] $m"      -ForegroundColor Green }
function Info($m)  { Write-Host "    $m"           -ForegroundColor DarkGray }
function Alerte($m){ Write-Host "    [!] $m"       -ForegroundColor Yellow }
function Echec($m) { Write-Host "    [ECHEC] $m"   -ForegroundColor Red; exit 1 }

$ici = $PSScriptRoot
$suffixe = if ($Production) { "" } else { "-Recette" }
$siteUrl = "https://$Tenant.sharepoint.com/sites/AGR-PRT-Opportunites$suffixe"
$adminUrl = "https://$Tenant-admin.sharepoint.com"

# Ce qui n'a pas pu être fait est collecté ici plutôt qu'annoncé au
# fil de l'eau : l'exploitant doit voir le reste à faire d'un coup,
# à la fin, pas éparpillé dans une page de journal.
$resteAFaire = New-Object System.Collections.Generic.List[string]

# ---------------------------------------------------------------
Titre "1. Prérequis"

if ($PSVersionTable.PSVersion.Major -lt 7) {
    Echec "PnP.PowerShell 2.x exige PowerShell 7. Version courante : $($PSVersionTable.PSVersion)."
}
Ok "PowerShell $($PSVersionTable.PSVersion)"

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Alerte "PnP.PowerShell absent — installation pour l'utilisateur courant."
    Install-Module PnP.PowerShell -Scope CurrentUser -Force -AllowClobber
}
$versionPnP = (Get-Module -ListAvailable -Name PnP.PowerShell |
               Sort-Object Version -Descending | Select-Object -First 1).Version
Ok "PnP.PowerShell $versionPnP"
Info "Site visé : $siteUrl"

foreach ($n in @("00-demarrage.ps1","01-provision-sharepoint.ps1","02-export-publication.ps1",
                 "03-jeu-essai.ps1","04-peupler-groupes.ps1","06-preparer-publication.ps1")) {
    if (-not (Test-Path (Join-Path $ici $n))) { Echec "Script manquant : $n" }
}
Ok "Scripts de la chaîne présents"

# ---------------------------------------------------------------
Titre "2. Application Entra ID"

if ($ClientId) {
    Ok "ClientId fourni : $ClientId"
} else {
    Alerte "Aucun ClientId — enregistrement d'une application par 00-demarrage.ps1."
    Info "Une fenêtre de connexion va s'ouvrir : accepter le consentement."
    # Splatting par table de hachage, et non par tableau : un tableau
    # est passé par POSITION, si bien que « -Tenant » deviendrait la
    # valeur du premier paramètre au lieu d'en nommer un.
    $args00 = @{ Tenant = $Tenant; SauterProvisionnement = $true }
    if ($Production) { $args00.Production = $true }
    & (Join-Path $ici "00-demarrage.ps1") @args00
    Echec ("Relancer ce script avec le ClientId affiché ci-dessus : " +
           "-ClientId `"<GUID>`". L'enregistrement d'une application ne peut pas " +
           "être enchaîné dans la même session : le jeton doit être réémis.")
}

# ---------------------------------------------------------------
Titre "3. Provisionnement du back-office"

if ($SauterProvisionnement) {
    Info "Ignoré (-SauterProvisionnement)."
} else {
    & (Join-Path $ici "01-provision-sharepoint.ps1") -AdminUrl $adminUrl -SiteUrl $siteUrl -ClientId $ClientId
    Ok "Site, listes, bibliothèques et groupes en place"
}

# ---------------------------------------------------------------
Titre "4. Groupes de sécurité"

if ($Habilitations) {
    if (-not (Test-Path $Habilitations)) { Echec "Fichier d'habilitations introuvable : $Habilitations" }
    & (Join-Path $ici "04-peupler-groupes.ps1") -SiteUrl $siteUrl -ClientId $ClientId -Fichier $Habilitations
    Ok "Groupes peuplés depuis $(Split-Path $Habilitations -Leaf)"
} else {
    Alerte "Aucun fichier d'habilitations (-Habilitations) : les groupes restent vides."
    Info "Tant qu'ils le sont, personne ne peut saisir d'avis dans SharePoint."
    Info "Modèle de départ : habilitations.exemple.csv (colonnes Groupe;Utilisateur)."
    $resteAFaire.Add("Peupler les groupes : .\04-peupler-groupes.ps1 -SiteUrl `"$siteUrl`" -ClientId `"$ClientId`" -Fichier `"<votre CSV>`"")
}

# ---------------------------------------------------------------
Titre "5. Jeu de recette"

if ($SansJeuEssai) {
    & (Join-Path $ici "03-jeu-essai.ps1") -SiteUrl $siteUrl -ClientId $ClientId -Supprimer
    Ok "Entrées « Essai — » retirées des listes"
} else {
    Info "Conservé. L'export les écarte de toute façon : elles ne peuvent"
    Info "pas atteindre le portail public sans -AvecJeuEssai."
}

# ---------------------------------------------------------------
Titre "6. Export des publications"

$argsExport = @{ SiteUrl = $siteUrl; ClientId = $ClientId; Sortie = $Sortie }
if ($Thumbprint) {
    $argsExport.Thumbprint = $Thumbprint
    $argsExport.Tenant     = "$Tenant.onmicrosoft.com"
} else {
    $argsExport.Interactif = $true
}
# $LASTEXITCODE vaut $null quand le script appelé revient sans « exit »
# explicite — et $null -ne 0 est vrai. Sans cette remise à zéro,
# un export réussi serait déclaré en échec.
$global:LASTEXITCODE = 0
& (Join-Path $ici "02-export-publication.ps1") @argsExport
if ($LASTEXITCODE -ne 0) { Echec "L'export a échoué (code $LASTEXITCODE)." }

$fichierJson = Join-Path $Sortie "data" "opportunites.json"
if (Test-Path $fichierJson) {
    $paquet = Get-Content $fichierJson -Raw | ConvertFrom-Json
    $nbAO = @($paquet.appelsOffres).Count
    $nbRH = @($paquet.recrutements).Count
    Ok "Export produit : $nbAO appel(s) d'offres, $nbRH recrutement(s)"
    if (($nbAO + $nbRH) -eq 0) {
        Alerte "Le portail affichera une liste vide : aucune entrée publiable dans SharePoint."
        Info "Saisir de vrais avis, ou déposer le jeu d'archives du dépôt"
        Info "(apps/web/portail-opportunites/archives/) en attendant."
    }
} else {
    Echec "L'export n'a pas produit $fichierJson."
}

# ---------------------------------------------------------------
Titre "7. Assemblage du dossier à mettre en ligne"

$argsPub = @{ SiteUrl = $siteUrl; ClientId = $ClientId; Sortie = $Sortie; SansExport = $true }
if ($Thumbprint) {
    $argsPub.Thumbprint = $Thumbprint
    $argsPub.Tenant     = "$Tenant.onmicrosoft.com"
} else {
    $argsPub.Interactif = $true
}
& (Join-Path $ici "06-preparer-publication.ps1") @argsPub
Ok "Dossier prêt : $Sortie"

# Un site public ne doit jamais porter d'URL de déclencheur (CDC §7.3).
$fuite = Get-ChildItem $Sortie -Recurse -File -Include *.js,*.html,*.json -ErrorAction SilentlyContinue |
         Select-String -Pattern "logic\.azure\.com|triggers/manual/paths/invoke" -List
if ($fuite) {
    Echec "Une URL de déclencheur Power Automate figure dans $($fuite[0].Path). Dépôt interrompu."
}
Ok "Aucun secret dans le dossier à publier"

# ---------------------------------------------------------------
Titre "8. Dépôt sur le serveur"

if ($CommandeDepot) {
    Info "Exécution : $CommandeDepot"
    $global:LASTEXITCODE = 0
    cmd.exe /c $CommandeDepot
    if ($LASTEXITCODE -ne 0) { Echec "La commande de dépôt a échoué (code $LASTEXITCODE)." }
    Ok "Fichiers déposés"
} else {
    Alerte "Aucune commande de dépôt (-CommandeDepot) : les fichiers restent dans $Sortie."
    $resteAFaire.Add("Déposer le contenu de $Sortie dans la racine servie du portail (/opt/portail-opportunites/www).")
}

# ---------------------------------------------------------------
Titre "9. Répétition automatique"

if (-not $Planifier) {
    Info "Non demandée (-Planifier)."
    $resteAFaire.Add("Planifier la republication toutes les $IntervalleMinutes minutes (relancer avec -Planifier).")
} elseif (-not $Thumbprint) {
    Alerte "Planification refusée : aucune empreinte de certificat (-Thumbprint)."
    Info "Une tâche planifiée s'exécute sans personne devant l'écran ; elle ne"
    Info "peut donc pas ouvrir de fenêtre de connexion. Installer une tâche qui"
    Info "échouerait toutes les $IntervalleMinutes minutes serait pire que de ne rien installer."
    $resteAFaire.Add("Ajouter un certificat à l'application Entra ID, puis relancer avec -Thumbprint et -Planifier (voir INSCRIPTION-APPLICATION-ENTRA-ID.md).")
} elseif (-not $CommandeDepot) {
    Alerte "Planification refusée : aucune commande de dépôt (-CommandeDepot)."
    Info "Une tâche qui exporte sans déposer ne nourrit pas le portail."
    $resteAFaire.Add("Fournir -CommandeDepot, puis relancer avec -Planifier.")
} else {
    # La tâche appelle un script figé plutôt qu'une longue ligne de
    # commande : plus lisible dans le planificateur, et modifiable
    # sans toucher à la tâche.
    $scriptTache = Join-Path $ici "tache-publication.ps1"
    @"
# Engendré par 07-mise-en-service.ps1 — ne pas modifier à la main.
# Republie les avis SharePoint vers le portail public.
`$ErrorActionPreference = "Stop"
`$global:LASTEXITCODE = 0
& "$ici\02-export-publication.ps1" ``
    -SiteUrl "$siteUrl" -ClientId "$ClientId" ``
    -Thumbprint "$Thumbprint" -Tenant "$Tenant.onmicrosoft.com" ``
    -Sortie "$Sortie"
if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
cmd.exe /c "$($CommandeDepot -replace '"','""')"
exit `$LASTEXITCODE
"@ | Set-Content -Path $scriptTache -Encoding UTF8
    Ok "Script de tâche écrit : $scriptTache"

    $nomTache = "AGEROUTE - Publication portail opportunites"
    $action = New-ScheduledTaskAction -Execute "pwsh.exe" `
                -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptTache`""
    $declencheur = New-ScheduledTaskTrigger -Once -At (Get-Date) `
                    -RepetitionInterval (New-TimeSpan -Minutes $IntervalleMinutes)
    $reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable `
                    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
                    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    Register-ScheduledTask -TaskName $nomTache -Action $action -Trigger $declencheur `
        -Settings $reglages -Description "Republie les avis SharePoint vers opportunites.ageroute.gov.gn" `
        -Force | Out-Null
    Ok "Tâche planifiée toutes les $IntervalleMinutes minutes : « $nomTache »"
    Info "Contrôle : Get-ScheduledTaskInfo -TaskName '$nomTache'"
}

# ---------------------------------------------------------------
Titre "Bilan"

Write-Host "    ClientId : $ClientId" -ForegroundColor DarkGray
Write-Host "    Site     : $siteUrl"  -ForegroundColor DarkGray
Write-Host "    Sortie   : $Sortie"   -ForegroundColor DarkGray

# Les flux ne sont pas créables par script : ils sont toujours à faire.
$resteAFaire.Add("Construire les flux Power Automate — commencer par WF-01 (validation avant publication), qui fait passer un avis au statut « Publié ». Voir CONSTRUCTION-FLUX-POWER-AUTOMATE.md.")

Write-Host ""
if ($resteAFaire.Count -eq 0) {
    Write-Host "    La chaîne est complète et se répète toute seule." -ForegroundColor Green
} else {
    Write-Host "    RESTE À FAIRE" -ForegroundColor Yellow
    $i = 1
    foreach ($r in $resteAFaire) {
        Write-Host "      $i. $r" -ForegroundColor Yellow
        $i++
    }
}
Write-Host ""
