# sharepoint / portail-opportunites

Scripts PnP.PowerShell du back-office SharePoint Online du portail des opportunités de l'AGEROUTE Guinée.

| Script | Rôle |
|---|---|
| `00-demarrage.ps1` | Démarrage assisté : installe le module, crée l'inscription d'application Entra ID, enchaîne le provisionnement. **Point d'entrée conseillé.** |
| `01-provision-sharepoint.ps1` | Provisionne le site de gestion : jeux de termes, bibliothèques, listes typées, validations, indexation, groupes et permissions. **Idempotent.** |
| `02-export-publication.ps1` | Extrait les contenus publiables et génère `data/opportunites.json` + la copie des documents publics pour le front. |
| `03-jeu-essai.ps1` | Insère un jeu d'essai couvrant tous les états d'affichage. Recette uniquement, réversible par `-Supprimer`. |

## Démarrage

```powershell
# Recette d'abord — le site créé porte le suffixe -Recette
./00-demarrage.ps1 -Tenant "ageroutegn"

# Production, une fois la recette validée
./00-demarrage.ps1 -Tenant "ageroutegn" -Production -ClientId "<GUID>"
```

Ces scripts s'exécutent depuis un poste de l'Agence : ils exigent une
authentification interactive auprès d'Entra ID et le rôle Administrateur
SharePoint. Aucun outil externe ne peut s'y substituer — voir
`docs/cahier-des-charges/portail-opportunites/INSCRIPTION-APPLICATION-ENTRA-ID.md`.

Prérequis : PowerShell 7 et `Install-Module PnP.PowerShell -Scope CurrentUser`.

La procédure complète (ordre des phases, recette, mise en production) figure dans
`docs/cahier-des-charges/portail-opportunites/GUIDE-DEPLOIEMENT.md`.

## Script 01 — points notables

- Crée les 4 listes (`Liste-AppelsOffres`, `Liste-Recrutements`, `Liste-Candidatures`, `Liste-Abonnes`) et les 7 bibliothèques.
- Pose la colonne `ReferenceMarche` sur les bibliothèques documentaires (rattachement lu par WF-02) et `GelArchivage` sur les appels d'offres (WF-04 n'archive pas un dossier gelé).
- **Indexe** les colonnes filtrées en OData par les flux : sans index, les requêtes des flux tombent sous la limite d'affichage de 5 000 éléments dès la deuxième année d'exploitation.
- Impose l'**unicité** de `ReferenceAO`, `ReferenceRH`, `NumeroDossier` et `CourrielAbonne`.
- Rompt l'héritage de permissions sur les candidatures (EXG-25) **et** sur la liste des abonnés, qui porte elle aussi des données personnelles.
- Applique la validation du format des références au niveau du champ. La formule s'écrit avec le **nom d'affichage** de la colonne (`[Référence]`), pas son nom interne.

`-ConserverPartageExterne` empêche le script de modifier le paramètre de partage de la collection, utile lorsque le site est provisionné dans un tenant mutualisé.

## Script 02 — points notables

- Lecture défensive : une date ou une URL vide écarte l'élément concerné au lieu d'interrompre tout l'export. Les éléments écartés sont comptés et journalisés.
- Écriture **atomique** du JSON (fichier temporaire puis renommage) : le front ne peut pas lire un fichier à moitié écrit.
- **Code de sortie** 0/1 et journal `journal-synchronisation.log` : ce sont les deux signaux du contrôle quotidien de cohérence (CDC §9.2) et de l'étape de vérification de WF-07.
- Les descriptions en champ enrichi sont converties en texte brut (balises retirées, entités décodées).
- Les candidatures ne sont **jamais** exportées : ni la liste, ni la bibliothèque ne sont dans le périmètre du script (EXG-25).

```powershell
# Exécution planifiée (production) — identité applicative par certificat
./02-export-publication.ps1 `
   -SiteUrl "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites" `
   -ClientId "<GUID>" -Thumbprint "<empreinte>" `
   -Tenant "ageroutegn.onmicrosoft.com" -Sortie "C:\publication\www"

# Export manuel de recette — connexion interactive, aucun certificat
./02-export-publication.ps1 `
   -SiteUrl "https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites-Recette" `
   -ClientId "<GUID>" -Interactif -Sortie "C:\publication\recette"
```

`-Interactif` est réservé aux essais : l'exécution planifiée ne doit dépendre
d'aucun compte nominatif (CDC §7.3).

`-SansDocuments` limite l'export au JSON — utile pour un rafraîchissement rapide déclenché par WF-07 lorsque seuls des métadonnées ont changé.
