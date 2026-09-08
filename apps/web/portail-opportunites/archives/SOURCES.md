# Provenance des données publiées

`opportunites.json` contient **douze avis réels de l'AGEROUTE Guinée S.A.**,
tous **clos**, réunis le 5 août 2026 pour ouvrir le portail avec un contenu
véritable plutôt qu'un jeu d'exemple.

## Ce que ces données sont — et ne sont pas

Elles proviennent des **avis officiels signés** (PDF joints dans `documents/`)
et, à défaut, des reprises de la presse guinéenne. Elles n'ont **pas** transité
par le back-office SharePoint : la chaîne d'export (script `02`) n'a pas encore
tourné en production.

En conséquence :

- **aucune procédure ci-dessous n'est ouverte** ; le portail n'appelle personne
  à soumissionner ni à candidater ;
- **les pièces détenues par la Direction des Marchés et Contrats font foi**
  en cas d'écart ;
- dès le premier export SharePoint, ce fichier est **remplacé** et ces avis
  n'ont plus lieu d'y figurer, sauf à être saisis dans le back-office.

Rien n'a été inventé pour combler un trou. Quand une information manque à la
source — c'est le cas de trois dates de clôture — le champ vaut `null` et le
portail affiche « non publiée ».

## Appels d'offres

| Référence | Source | Publié | Clôture |
|---|---|---|---|
| AOON N° 002T/DAO/AGEROUTE/DMC/2026 — 5 lots | [avis signé (PDF)](https://guineenews.org/wp-content/uploads/2026/05/scan-DAO-5-lots.pdf), via [Guinéenews](https://guineenews.org/2026/05/07/lageroute-lance-un-avis-dappel-doffres-national-pour-les-travaux-de-construction-et-de-bitumage-des-routes-en-cinq-lots/) | 06/05/2026 | 05/06/2026 10h00 |
| AOON N° 001T/DAO/AGEROUTE/DMC/2026 — 4 lots | [avis signé (PDF)](https://guineenews.org/wp-content/uploads/2026/04/Ageroute.pdf), via [Guinéenews](https://guineenews.org/2026/04/27/lageroute-lance-un-avis-dappel-doffres-national-pour-des-travaux-de-construction-et-de-bitumage-de-routes-en-quatre-lots/) | 27/04/2026 | 27/05/2026 10h00 |
| PV d'ouverture des plis — AOON 001T | [Guineematin](https://guineematin.com/2026/06/02/appel-doffres-ouvert-ageroute-guinee-sa-financement-bnd/) | 02/06/2026 | séance du 02/06/2026 |
| Relance — Siguiri, 30 km | [Journal Horoya](https://horoya.net/2025/10/22/relance-de-lappel-doffres-pour-les-travaux-de-construction-et-de-bitumage-de-30-km-de-route-a-siguiri/) | 22/10/2025 | **non publiée à la source** |
| AMI N° 0764/MITP/AGEROUTE/DGA/DMC/2023 | [Archives JAO Guinée](https://archive.jaoguinee.com/post.php?id=3621) | 16/10/2023 | 02/11/2023 |
| AAO N° 001/DMC/DG/2022 — accord-cadre | [Archives JAO Guinée](https://archive.jaoguinee.com/post.php?id=2036) | 12/12/2022 | 13/01/2023 10h00 |

## Recrutements

| Poste | Source | Publié | Clôture |
|---|---|---|---|
| Ingénieur homologue (06) — UGP-BID/BAD | [avis signé (PDF)](https://mediaguinee.com/wp-content/uploads/2026/07/Ingenieur_Homomogue_Ageroute_BAD_BID.pdf), via [Mediaguinée](https://mediaguinee.com/2026/07/ageroute-appel-a-candidatures-pour-le-recrutement-de-six-06-ingenieurs-homologues-en-genie-civil-genie-rural-ou-discipline-equivalente-ugp-bid-bad-ageroute-guinee-s-a) | 17/07/2026 | **renvoyée à l'avis définitif** |
| Assistant en passation des marchés (04) — UGP-BID/BAD | [avis signé (PDF)](https://mediaguinee.com/wp-content/uploads/2026/07/Assistants_Passation_Marches_Ageroute_BAD_BID.pdf) | 17/07/2026 | **non précisée** |
| Coordonnateur de Projets Routiers (05) | [TDR (PDF)](https://www.africaguinee.com/app/uploads/2025/07/Avis-de-recrutement-5-Coordonnateurs-de-Projets-Ro_250708_072550_compressed.pdf), via [Africa Guinée](https://www.africaguinee.com/termes-de-reference-pour-le-recrutement-de-cinq-05-coordonnateurs-de-projets-routiers/) | 08/07/2025 | **non précisée** |
| Directeur des Marchés et Contrats | [avis n° 675 (PDF)](https://guineenews.org/wp-content/uploads/2025/09/AVIS-DE-RECRUTEMENT-PERSONNEL-CLE-AGEROUTE.pdf) | 23/09/2025 | 10/10/2025 17h00 |
| Directeur des Travaux d'Investissements Routiers | idem | 23/09/2025 | 10/10/2025 17h00 |
| Contrôleur de Gestion | idem | 23/09/2025 | 10/10/2025 17h00 |

L'avis n° 675 du 23 septembre 2025 portait **huit postes**. Trois figurent
ici ; les cinq autres — Directeur Administratif et du Capital Humain,
Directeur chargé de la Structuration Financière des Projets, Directeur des
Travaux d'Entretien Routier et Maintenance, Chef du Service Communication,
Relations Publiques et Usagers, Chef du Service Qualité — sont dans le PDF
joint et peuvent être ajoutés à l'identique.

## Pièces jointes

Les six PDF de `documents/` sont les **originaux téléchargés**, non
recompressés : sur des documents signés et tamponnés, la fidélité prime sur
le poids. Ils totalisent 11 Mo, et voyagent donc dans `documents.zip`, séparé
de l'installateur.
