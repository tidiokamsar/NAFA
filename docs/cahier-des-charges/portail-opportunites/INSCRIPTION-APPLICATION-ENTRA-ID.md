# AGEROUTE Guinée — Inscription de l'application Entra ID

Prérequis technique de la phase 0 du guide de déploiement. Sans cette inscription,
aucun outil ne peut s'authentifier auprès de SharePoint Online : ni les scripts
PnP.PowerShell, ni un automate de publication, ni un poste d'administration.

## Pourquoi c'est obligatoire

Depuis septembre 2024, `PnP.PowerShell` n'embarque plus d'application par défaut :
chaque organisation doit déclarer la sienne. Par ailleurs, les applications
Microsoft de première partie (Azure CLI, Azure PowerShell, PnP Management Shell)
ne sont pas préautorisées pour l'API SharePoint dans un tenant qui ne les a pas
explicitement approuvées — toute tentative échoue avec :

```
AADSTS65002: Consent between first party application '<id>' and first party
resource '00000003-0000-0ff1-ce00-000000000000' must be configured via
preauthorization.
```

`00000003-0000-0ff1-ce00-000000000000` est l'API SharePoint Online,
`00000003-0000-0000-c000-000000000000` est Microsoft Graph.

Une application déclarée par l'Agence règle le problème, et respecte au passage
l'exigence de moindre privilège du CDC §7.3.

---

## Voie A — En une commande (recommandée)

Sur un poste Windows disposant de PowerShell 7 :

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser

Register-PnPEntraIDAppForInteractiveLogin `
    -ApplicationName "AGR-PRT-Publication" `
    -Tenant "ageroutegn.onmicrosoft.com" `
    -Interactive
```

La commande crée l'inscription, active le flux client public, demande les
autorisations SharePoint et ouvre la fenêtre de consentement administrateur.
Elle affiche en retour l'**Application (client) ID** — c'est le GUID à passer
en `-ClientId` aux scripts 01 et 02.

Pour la publication automatisée (script 02, exécuté sans interaction humaine),
utiliser la variante par certificat :

```powershell
Register-PnPEntraIDApp `
    -ApplicationName "AGR-PRT-Publication-Certificat" `
    -Tenant "ageroutegn.onmicrosoft.com" `
    -OutPath C:\coffre `
    -CertificatePassword (Read-Host -AsSecureString) `
    -SharePointApplicationPermissions "Sites.Selected" `
    -Interactive
```

Le certificat produit est déposé dans `C:\coffre` : il doit rejoindre le coffre
de l'Agence et ne jamais être versionné. `Sites.Selected` n'accorde encore aucun
accès : il faut ensuite habiliter l'application sur le seul site du portail.

```powershell
Grant-PnPAzureADAppSitePermission `
    -AppId "<GUID>" -DisplayName "AGR-PRT-Publication-Certificat" `
    -Site "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites" `
    -Permissions FullControl
```

---

## Voie B — Par le portail (sans PowerShell)

À utiliser si le poste d'administration ne peut pas exécuter PnP.PowerShell, ou
pour permettre à un outil externe de se connecter par code d'appareil.

1. **https://entra.microsoft.com** → *Applications* → *Inscriptions d'applications*
   → **Nouvelle inscription**.
2. Nom : `AGR-PRT-Publication`. Comptes pris en charge : *Comptes dans cet annuaire
   d'organisation uniquement*. Pas d'URI de redirection. → **Inscrire**.
3. Noter l'**ID d'application (client)** et l'**ID de l'annuaire (locataire)**.
4. Onglet **Authentification** → section *Paramètres avancés* →
   « Autoriser les flux clients publics » = **Oui** → *Enregistrer*.
   Sans cela, l'authentification par code d'appareil est refusée.
5. Onglet **API autorisées** → *Ajouter une autorisation* →
   **SharePoint** → *Autorisations déléguées* → cocher
   `AllSites.FullControl` (et `TermStore.ReadWrite.All` pour les jeux de termes).
6. Toujours dans *API autorisées* → **Accorder le consentement administrateur
   pour AGEROUTE**. La colonne « État » doit afficher une coche verte.

Pour un accès en lecture seule (inventaire, contrôle de cohérence), remplacer
l'étape 5 par `AllSites.Read` : c'est la portée à privilégier pour tout ce qui
n'a pas besoin d'écrire.

---

## Ce que chaque voie permet

| Opération | Voie A (PnP) | Voie B + API REST |
|---|---|---|
| Créer le site de gestion | ✅ | ✅ (`/_api/SPSiteManager/create`) |
| Créer listes, bibliothèques, colonnes | ✅ | ✅ |
| Indexation, unicité, validation des colonnes | ✅ | ✅ |
| Jeux de termes | ✅ | ✅ |
| **Rompre l'héritage et restreindre les candidatures (EXG-25)** | ✅ | ✅ |
| Désactiver le partage externe de la collection | ✅ | ⚠️ nécessite l'API du centre d'administration |

À noter : **Microsoft Graph ne sait pas rompre l'héritage de permissions ni poser
des attributions de rôle sur une liste.** Un provisionnement conduit uniquement
par Graph créerait la liste `Candidatures` sans ses restrictions d'accès — donc
des données personnelles de candidats lisibles par tous les membres du site.
C'est la raison pour laquelle la voie Graph seule est écartée.

---

## Vérification

```powershell
Connect-PnPOnline -Url "https://ageroutegn.sharepoint.com" -Interactive -ClientId "<GUID>"
Get-PnPWeb | Select-Object Title, Url
```

Si le titre du site s'affiche, l'inscription est fonctionnelle et les scripts 01
et 02 peuvent être lancés.
