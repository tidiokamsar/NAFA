<#
=====================================================================
 AGEROUTE GUINÉE — Portail Public des Opportunités
 Script 01 — Provisioning du back-office SharePoint Online
=====================================================================
 Réf. cahier des charges v2.0 — sections 5 (modèle de données)
 et 7.1 (modèle de permissions).

 PRÉREQUIS
   - PowerShell 7 et module PnP.PowerShell 2.x
       Install-Module PnP.PowerShell -Scope CurrentUser
   - Une inscription d'application Entra ID (auth interactive ou
     certificat) avec les autorisations SharePoint appropriées.
   - Compte disposant du rôle Administrateur SharePoint pour la
     création du site ; exécution ensuite possible en propriétaire.

 USAGE
   .\01-provision-sharepoint.ps1 `
       -AdminUrl  "https://ageroute-admin.sharepoint.com" `
       -SiteUrl   "https://ageroute.sharepoint.com/sites/AGR-PRT-Opportunites" `
       -ClientId  "<GUID application Entra ID>"

 Le script est IDEMPOTENT : ré-exécutable sans dommage, il ne
 recrée pas ce qui existe déjà (principe exigé pour DEV/UAT/PROD).

 Ce script couvre l'intégralité du modèle de données, y compris les
 éléments qui figuraient auparavant en « actions manuelles » :
 liste des abonnés (WF-08), colonne ReferenceMarche des
 bibliothèques documentaires (WF-02), colonne GelArchivage (WF-04),
 indexation des colonnes filtrées par les flux et contrainte
 d'unicité des numéros de dossier.
=====================================================================
#>

param(
    [Parameter(Mandatory = $true)] [string] $AdminUrl,
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [string] $TitreSite = "AGEROUTE — Portail Opportunités (Gestion)",
    [string] $Langue    = "1036",   # 1036 = français
    [switch] $ConserverPartageExterne
)

$ErrorActionPreference = "Stop"
function Etape($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Info($msg)  { Write-Host "    [--] $msg" -ForegroundColor DarkGray }

# ---------------------------------------------------------------
# 0. Création du site (si absent) puis connexion
# ---------------------------------------------------------------
Etape "Connexion au centre d'administration"
Connect-PnPOnline -Url $AdminUrl -Interactive -ClientId $ClientId

Etape "Création du site de gestion (si nécessaire)"
$site = Get-PnPTenantSite -Identity $SiteUrl -ErrorAction SilentlyContinue
if (-not $site) {
    New-PnPSite -Type CommunicationSite -Url $SiteUrl -Title $TitreSite -Lcid $Langue -Wait
    Ok "Site créé : $SiteUrl"
} else { Ok "Site déjà présent" }

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

# ---------------------------------------------------------------
# Fonctions d'aide — toutes idempotentes
# ---------------------------------------------------------------
function ChampTexte($liste, $nom, $titre, $oblig = $false) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type Text -AddToDefaultView | Out-Null
        if ($oblig) { Set-PnPField -List $liste -Identity $nom -Values @{ Required = $true } | Out-Null }
    }
}
function ChampChoix($liste, $nom, $titre, $choix) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type Choice -Choices $choix -AddToDefaultView | Out-Null
    }
}
function ChampDate($liste, $nom, $titre) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type DateTime -AddToDefaultView | Out-Null
    }
}
function ChampNote($liste, $nom, $titre) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type Note | Out-Null
    }
}
function ChampTaxo($liste, $nom, $titre, $jeu) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPTaxonomyField -List $liste -InternalName $nom -DisplayName $titre `
            -TermSetPath "AGEROUTE|$jeu" -AddToDefaultView | Out-Null
    }
}
function ChampNombre($liste, $nom, $titre) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type Number | Out-Null
    }
}
function ChampUrl($liste, $nom, $titre) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type URL | Out-Null
    }
}
function ChampBooleen($liste, $nom, $titre) {
    if (-not (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue)) {
        Add-PnPField -List $liste -InternalName $nom -DisplayName $titre -Type Boolean | Out-Null
    }
}

# Les flux WF-02/03/04 filtrent en OData sur ces colonnes : sans
# index, les requêtes tombent sous la limite d'affichage (5 000).
function Indexer($liste, $nom) {
    if (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue) {
        Set-PnPField -List $liste -Identity $nom -Values @{ Indexed = $true } | Out-Null
    }
}
function IndexerUnique($liste, $nom) {
    if (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue) {
        # L'unicité exige une colonne indexée ET obligatoire.
        Set-PnPField -List $liste -Identity $nom -Values @{ Indexed = $true; Required = $true } | Out-Null
        Set-PnPField -List $liste -Identity $nom -Values @{ EnforceUniqueValues = $true } | Out-Null
    }
}
# La validation se pose au niveau du champ : les formules de liste
# ne sont pas exposées par Set-PnPList.
function Valider($liste, $nom, $formule, $message) {
    if (Get-PnPField -List $liste -Identity $nom -ErrorAction SilentlyContinue) {
        Set-PnPField -List $liste -Identity $nom -Values @{
            ValidationFormula = $formule
            ValidationMessage = $message
        } | Out-Null
    }
}

# ---------------------------------------------------------------
# 1. Magasin de termes (Régions, Bailleurs, Directions) — CDC §5.6
# ---------------------------------------------------------------
Etape "Magasin de termes AGEROUTE"
$groupe = "AGEROUTE"
if (-not (Get-PnPTermGroup -Identity $groupe -ErrorAction SilentlyContinue)) {
    New-PnPTermGroup -Name $groupe | Out-Null
}
$jeux = [ordered]@{
    "Regions"    = @("Conakry","Kindia","Boké","Labé","Mamou","Faranah","Kankan","N'Zérékoré","National")
    "Bailleurs"  = @("Budget national","Banque mondiale","BAD","BID","Union européenne","Autre")
    "Directions" = @("Direction Générale","Direction Technique","DAF","Passation des Marchés","Ressources Humaines","Communication","DSI")
}
foreach ($jeu in $jeux.Keys) {
    if (-not (Get-PnPTermSet -Identity $jeu -TermGroup $groupe -ErrorAction SilentlyContinue)) {
        New-PnPTermSet -Name $jeu -TermGroup $groupe | Out-Null
    }
    foreach ($t in $jeux[$jeu]) {
        if (-not (Get-PnPTerm -Identity $t -TermSet $jeu -TermGroup $groupe -ErrorAction SilentlyContinue)) {
            New-PnPTerm -Name $t -TermSet $jeu -TermGroup $groupe | Out-Null
        }
    }
    Ok "Jeu de termes '$jeu' provisionné"
}

# ---------------------------------------------------------------
# 2. Bibliothèques de documents — CDC §5.2
# ---------------------------------------------------------------
Etape "Bibliothèques de documents"
$bibliotheques = @(
    @{Nom="AppelsOffres";   Desc="Avis de marché signés (PDF) — publication publique"},
    @{Nom="DAO";            Desc="Dossiers d'appel d'offres et annexes"},
    @{Nom="Additifs";       Desc="Additifs et clarifications"},
    @{Nom="Attributions";   Desc="PV et avis d'attribution"},
    @{Nom="RecrutementTDR"; Desc="TDR et avis de recrutement"},
    @{Nom="Candidatures";   Desc="Dossiers des candidats — ACCÈS RESTREINT RH"},
    @{Nom="Medias";         Desc="Bannières, visuels et logos du portail"}
)
foreach ($b in $bibliotheques) {
    if (-not (Get-PnPList -Identity $b.Nom -ErrorAction SilentlyContinue)) {
        New-PnPList -Title $b.Nom -Template DocumentLibrary -OnQuickLaunch | Out-Null
        Set-PnPList -Identity $b.Nom -Description $b.Desc `
                    -EnableVersioning $true -MajorVersions 50 | Out-Null
    }
    Ok "Bibliothèque '$($b.Nom)'"
}

# Dossiers annuels dans AppelsOffres
foreach ($an in @("2026","2025","Archives")) {
    Resolve-PnPFolder -SiteRelativePath "AppelsOffres/$an" | Out-Null
}

# Rattachement des documents à un marché — lu par WF-02 pour
# retrouver l'avis correspondant à un additif déposé.
Etape "Colonne de rattachement ReferenceMarche"
foreach ($bib in @("DAO","Additifs","Attributions","AppelsOffres","RecrutementTDR")) {
    ChampTexte $bib "ReferenceMarche" "Référence du marché"
    Indexer $bib "ReferenceMarche"
    Ok "ReferenceMarche sur '$bib'"
}

# ---------------------------------------------------------------
# 3. Liste « Appels d'offres » — CDC §5.3
# ---------------------------------------------------------------
Etape "Liste AppelsOffres (métadonnées)"
$lAO = "Liste-AppelsOffres"
if (-not (Get-PnPList -Identity $lAO -ErrorAction SilentlyContinue)) {
    New-PnPList -Title $lAO -Template GenericList -OnQuickLaunch | Out-Null
    Set-PnPList -Identity $lAO -EnableVersioning $true | Out-Null
}
ChampTexte  $lAO "ReferenceAO" "Référence" $true
ChampNote   $lAO "DescriptionAO" "Description"
ChampChoix  $lAO "TypeMarche" "Type de marché" @("Travaux","Fournitures","Services","Prestations intellectuelles")
ChampTaxo   $lAO "RegionAO" "Région" "Regions"
ChampTaxo   $lAO "BailleurAO" "Bailleur" "Bailleurs"
ChampDate   $lAO "DatePublication" "Date de publication"
ChampDate   $lAO "DateCloture" "Date et heure de clôture"
ChampDate   $lAO "DerniereModification" "Dernière modification publiée"
ChampChoix  $lAO "StatutAO" "Statut" @("Brouillon","En validation","Publié","Clôturé","Attribué","Annulé","Archivé")
ChampUrl    $lAO "LienDAO" "Lien vers le DAO"
ChampUrl    $lAO "LienResultat" "Lien attribution"
ChampNombre $lAO "CompteurTelechargements" "Téléchargements"
# WF-04 saute l'archivage des dossiers gelés (recours, contentieux).
ChampBooleen $lAO "GelArchivage" "Gel de l'archivage"

# Format de référence AO/AAAA/NNN — la formule s'écrit avec le nom
# d'affichage de la colonne, pas son nom interne.
Valider $lAO "ReferenceAO" '=AND(LEFT([Référence],3)="AO/",LEN([Référence])=11)' `
    "La référence doit respecter le format AO/AAAA/NNN (ex. AO/2026/015)."
IndexerUnique $lAO "ReferenceAO"
Indexer $lAO "StatutAO"
Indexer $lAO "DateCloture"
Ok "Liste AppelsOffres complète"

# ---------------------------------------------------------------
# 4. Liste « Recrutements » — CDC §5.4
# ---------------------------------------------------------------
Etape "Liste Recrutements"
$lRH = "Liste-Recrutements"
if (-not (Get-PnPList -Identity $lRH -ErrorAction SilentlyContinue)) {
    New-PnPList -Title $lRH -Template GenericList -OnQuickLaunch | Out-Null
    Set-PnPList -Identity $lRH -EnableVersioning $true | Out-Null
}
ChampTexte $lRH "ReferenceRH" "Référence" $true
ChampChoix $lRH "TypeContrat" "Type de contrat" @("CDI","CDD","Consultant","Stage")
ChampTaxo  $lRH "DirectionRH" "Direction" "Directions"
ChampTaxo  $lRH "LieuRH" "Lieu d'affectation" "Regions"
ChampDate  $lRH "DatePublication" "Date de publication"
ChampDate  $lRH "DateLimite" "Date limite de candidature"
ChampNote  $lRH "DescriptionRH" "Description du poste"
ChampUrl   $lRH "LienTDR" "Lien vers les TDR"
ChampChoix $lRH "StatutRH" "Statut" @("Brouillon","En validation","Publié","Clôturé","Résultats publiés","Archivé")

Valider $lRH "ReferenceRH" '=AND(LEFT([Référence],3)="RH/",LEN([Référence])=11)' `
    "La référence doit respecter le format RH/AAAA/NNN (ex. RH/2026/012)."
IndexerUnique $lRH "ReferenceRH"
Indexer $lRH "StatutRH"
Indexer $lRH "DateLimite"
Ok "Liste Recrutements complète"

# ---------------------------------------------------------------
# 5. Liste « Candidatures » (sécurisée) — CDC §5.5
# ---------------------------------------------------------------
Etape "Liste Candidatures (sécurisée)"
$lCand = "Liste-Candidatures"
if (-not (Get-PnPList -Identity $lCand -ErrorAction SilentlyContinue)) {
    New-PnPList -Title $lCand -Template GenericList | Out-Null
    Set-PnPList -Identity $lCand -EnableVersioning $true -Hidden $true | Out-Null
}
ChampTexte $lCand "NumeroDossier" "Numéro de dossier" $true
ChampTexte $lCand "NomCandidat" "Nom" $true
ChampTexte $lCand "PrenomCandidat" "Prénom" $true
ChampTexte $lCand "CourrielCandidat" "Courriel" $true
ChampTexte $lCand "TelephoneCandidat" "Téléphone"
ChampDate  $lCand "DateDepot" "Date de dépôt"
ChampChoix $lCand "ConsentementRGPD" "Consentement au traitement" @("Oui")
ChampChoix $lCand "StatutDossier" "Statut du dossier" @("Reçu","En cours d'examen","Clôturé")
if (-not (Get-PnPField -List $lCand -Identity "OffreLiee" -ErrorAction SilentlyContinue)) {
    $idListeRH = (Get-PnPList -Identity $lRH).Id
    Add-PnPField -List $lCand -InternalName "OffreLiee" -DisplayName "Offre liée" `
        -Type Lookup -AddToDefaultView | Out-Null
    Set-PnPField -List $lCand -Identity "OffreLiee" `
        -Values @{ LookupList = "$idListeRH"; LookupField = "ReferenceRH" } | Out-Null
}
# WF-05 régénère le numéro en cas de collision : la contrainte
# d'unicité rend cette boucle réellement fiable.
IndexerUnique $lCand "NumeroDossier"
Indexer $lCand "DateDepot"
Ok "Liste Candidatures complète"

# ---------------------------------------------------------------
# 6. Liste « Abonnés » (double opt-in) — WF-08, EXG-32/33
# ---------------------------------------------------------------
Etape "Liste Abonnes (diffusion)"
$lAbo = "Liste-Abonnes"
if (-not (Get-PnPList -Identity $lAbo -ErrorAction SilentlyContinue)) {
    New-PnPList -Title $lAbo -Template GenericList | Out-Null
    Set-PnPList -Identity $lAbo -EnableVersioning $true -Hidden $true | Out-Null
}
ChampTexte $lAbo "CourrielAbonne" "Courriel" $true
ChampChoix $lAbo "ThemeAbonne" "Thème" @("AO","Recrutement","Les deux")
ChampChoix $lAbo "StatutAbonne" "Statut" @("En attente","Confirmé","Désabonné")
ChampTexte $lAbo "JetonConfirmation" "Jeton de confirmation"
ChampDate  $lAbo "DateInscription" "Date d'inscription"
ChampDate  $lAbo "DateConsentement" "Date de consentement"
# Une adresse ne peut être inscrite qu'une fois ; le jeton est
# recherché tel quel par le flux B, donc indexé lui aussi.
IndexerUnique $lAbo "CourrielAbonne"
Indexer $lAbo "JetonConfirmation"
Indexer $lAbo "StatutAbonne"
Ok "Liste Abonnes complète"

# ---------------------------------------------------------------
# 7. Groupes de sécurité et permissions — CDC §7.1
# ---------------------------------------------------------------
Etape "Groupes et permissions"
$groupes = @(
    @{Nom="AGR-PRT-Admins";          Role="Contrôle total"},
    @{Nom="AGR-PRT-DPMP-Contrib";    Role="Collaboration"},
    @{Nom="AGR-PRT-RH-Contrib";      Role="Collaboration"},
    @{Nom="AGR-PRT-Valideurs";       Role="Collaboration"},
    @{Nom="AGR-PRT-Comm";            Role="Collaboration"},
    @{Nom="AGR-PRT-RH-Candidatures"; Role="Collaboration"}
)
foreach ($g in $groupes) {
    if (-not (Get-PnPGroup -Identity $g.Nom -ErrorAction SilentlyContinue)) {
        New-PnPGroup -Title $g.Nom | Out-Null
        Set-PnPGroupPermissions -Identity $g.Nom -AddRole $g.Role
    }
    Ok "Groupe '$($g.Nom)'"
}

# RUPTURE D'HÉRITAGE sur les candidatures — exigence EXG-25.
# La liste des abonnés porte des données personnelles : elle est
# restreinte selon le même principe.
Etape "Sécurisation des données personnelles (rupture d'héritage)"
foreach ($cible in @($lCand, "Candidatures", $lAbo)) {
    Set-PnPList -Identity $cible -BreakRoleInheritance -CopyRoleAssignments:$false | Out-Null
    Set-PnPListPermission -Identity $cible -Group "AGR-PRT-Admins"          -AddRole "Contrôle total"
    Set-PnPListPermission -Identity $cible -Group "AGR-PRT-RH-Candidatures" -AddRole "Collaboration"
    Ok "Héritage rompu et droits restreints sur '$cible'"
}

# Interdiction du partage externe sur la collection — CDC §7.3
Etape "Partage externe"
if ($ConserverPartageExterne) {
    Info "Partage externe laissé en l'état (paramètre -ConserverPartageExterne)."
} else {
    Connect-PnPOnline -Url $AdminUrl -Interactive -ClientId $ClientId
    Set-PnPTenantSite -Identity $SiteUrl -SharingCapability Disabled
    Ok "Partage externe désactivé sur la collection"
    Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId
}

Write-Host "`n=====================================================" -ForegroundColor Yellow
Write-Host " PROVISIONING TERMINÉ." -ForegroundColor Yellow
Write-Host " Étapes suivantes :" -ForegroundColor Yellow
Write-Host "   1. Peupler les groupes de sécurité (PV d'habilitation)." -ForegroundColor Yellow
Write-Host "   2. Construire les flux (docs/.../CONSTRUCTION-FLUX...)." -ForegroundColor Yellow
Write-Host "   3. Planifier 02-export-publication.ps1." -ForegroundColor Yellow
Write-Host "   4. Déployer le front et le relais de candidature." -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Yellow
