# WF-04 — Clôture et archivage automatiques
# Feuille de construction pas à pas

Le flux qui retire de l'affichage ce qui n'est plus ouvert. Sans lui, un avis
dont la date limite est passée reste marqué « Publié » : une entreprise prépare
un dossier pour rien, se déplace, et découvre sur place que la consultation est
close. C'est le genre de défaut qui se règle ensuite en réclamation.

Il porte **EXG-26** par ricochet : WF-05 refuse tout dépôt sur une offre dont le
statut n'est plus « Publié ».

---

## Avant de commencer

| Prérequis | Vérification |
|---|---|
| Solution `AGR-PRT-Automatisation` créée | Power Automate → Solutions |
| Connexion SharePoint sur `svc-portail@ageroute.gov.gn` | Jamais un compte nominatif |
| Colonnes `StatutAO` et `DateCloture` indexées | Faites par le script 01 |
| Dossier `AppelsOffres/Archives` existant | À créer si absent — voir §5 |

Nom : `AGR-PRT-WF04-Cloture-Archivage`

Contrairement à WF-01, **un seul flux suffit** : le déclencheur est une
périodicité, pas une liste. Il traite les deux listes dans le même passage.

---

## 1. Déclencheur — Périodicité

Action : **Planification → Périodicité**

| Champ | Valeur |
|---|---|
| Intervalle | `1` |
| Fréquence | `Jour` |
| Fuseau horaire | **(UTC) Temps universel coordonné** |
| Heures | `0` |
| Minutes | `15` |

### Sur le fuseau

La Guinée est à **UTC+0 toute l'année**, sans heure d'été. `utcNow()` donne donc
directement l'heure de Conakry : aucune conversion nulle part dans ce flux.

C'est une chance qu'il faut noter, parce qu'elle ne se voit pas — quelqu'un qui
reprendra ce flux en pensant devoir décaler les heures introduira un bogue en
voulant bien faire.

> **Un point à vérifier une fois.** SharePoint stocke les dates en UTC mais les
> affiche selon le fuseau régional du site. Si ce fuseau n'est pas UTC, une
> clôture saisie « 10h00 » sera stockée à une autre heure et le flux se
> déclenchera au mauvais moment. Contrôler dans *Paramètres du site → Paramètres
> régionaux* que le fuseau est bien `(UTC) Coordinated Universal Time`.

---

## 2. Clôturer les appels d'offres échus

Action : **SharePoint → Obtenir les éléments**

| Champ | Valeur |
|---|---|
| Nom de la liste | `Liste-AppelsOffres` |
| Requête de filtre | voir ci-dessous |
| **Nombre maximal d'éléments** | `5000` |

```
StatutAO eq 'Publié' and DateCloture lt '@{utcNow()}'
```

### Les 100 éléments qu'on ne voit pas

Sans le champ **Nombre maximal d'éléments**, l'action en renvoie **100** et
s'arrête là, sans le dire. Le flux se termine en succès, et les avis au-delà du
centième restent affichés comme ouverts. Le défaut est invisible pendant des
mois, jusqu'au jour où le portail dépasse cent avis.

Renseigner 5000, et activer aussi la **pagination** (`…` → Paramètres →
Pagination → Activé, seuil 5000) : les deux réglages sont nécessaires.

### Pourquoi l'indexation compte

Au-delà de 5000 éléments, SharePoint refuse toute requête portant sur une
colonne non indexée. Le script `01-provision-sharepoint.ps1` indexe `StatutAO`
et `DateCloture` précisément pour ce flux. Si vous ajoutez un critère sur une
autre colonne, il faudra l'indexer aussi.

### L'accent dans le filtre

`'Publié'` porte un accent, dans une requête OData transmise en URL. Le
connecteur l'encode correctement, mais si le filtre ne remonte jamais rien alors
que des éléments correspondent, c'est la première piste : dupliquer le flux, y
tester `StatutAO ne 'Brouillon'` pour voir si le filtre lui-même fonctionne.

### Mettre à jour

Action : **Appliquer à chacun** sur `value`, contenant :

**SharePoint → Mettre à jour l'élément**

| Champ | Valeur |
|---|---|
| Id | `@{items('Appliquer_à_chacun')?['ID']}` |
| Statut | `Clôturé` |

> Rappel de WF-01 : « Mettre à jour l'élément » **efface** tout champ laissé
> vide. Reporter les valeurs existantes pour toutes les colonnes que le flux ne
> modifie pas, ou utiliser plutôt *Envoyer une requête HTTP à SharePoint* en
> `MERGE`, qui ne touche que ce qu'on lui donne.

Dans **Paramètres** de l'« Appliquer à chacun » : concurrence à **1**. Les mises
à jour concurrentes sur la même liste produisent des conflits de version que le
flux signale comme des échecs aléatoires — difficiles à reproduire.

---

## 3. Clôturer les recrutements échus

Même chose sur `Liste-Recrutements` :

```
StatutRH eq 'Publié' and DateLimite lt '@{utcNow()}'
```

→ `StatutRH = Clôturé`.

**C'est l'étape qui porte EXG-26.** WF-05 lit ce statut avant d'accepter une
candidature : une offre clôturée ici devient inaccessible au dépôt, quel que
soit ce que le navigateur du candidat affiche encore.

---

## 4. La fenêtre résiduelle — et pourquoi elle est déjà couverte

Entre l'heure réelle de clôture et le passage de 00h15, une offre reste
« Publié ». Une candidature déposée à 18h sur une offre close à 17h passerait.

Ce trou est **déjà bouché ailleurs**, à deux endroits :

- le relais (`verifierRecevabilite`, `services/integrations/relais-portail`)
  compare la date limite à l'heure courante et refuse en `409` ;
- WF-05 refait le même contrôle de son côté, sans faire confiance au relais.

Ne pas essayer de le combler ici en faisant tourner le flux toutes les heures :
on multiplierait par vingt-quatre la consommation de quota pour une garantie
qu'on a déjà, et de façon plus fiable, au moment du dépôt.

---

## 5. Archiver ce qui est clos depuis trente jours

Action : **Obtenir les éléments** sur `Liste-AppelsOffres`

```
StatutAO eq 'Clôturé' and DateCloture lt '@{addDays(utcNow(),-30)}' and GelArchivage ne 1
```

### `ne 1`, et non `ne true`

En OData sur SharePoint, un booléen se compare à **0 ou 1**, pas à `true` ou
`false`. Écrit `ne false`, le filtre échoue — et selon les cas il remonte tout,
ce qui archiverait des dossiers gelés.

### À quoi sert le gel

`GelArchivage` est une colonne booléenne posée par le script 01. Un dossier sous
recours ou en contentieux doit rester consultable en l'état : le juriste coche
la case, et le flux le laisse tranquille indéfiniment.

C'est une décision humaine que le flux respecte, jamais une qu'il prend.

### Mettre à jour et déplacer

Dans l'« Appliquer à chacun » :

1. **Mettre à jour l'élément** → `StatutAO = Archivé`.
2. **SharePoint → Déplacer le fichier** — du dossier `DAO` vers
   `AppelsOffres/Archives`.

Créer le dossier de destination **avant** le premier passage : l'action échoue
si le chemin n'existe pas, et l'échec survient après la mise à jour du statut —
l'avis se retrouve alors archivé mais ses pièces encore à l'ancien emplacement.

Pour l'éviter, mettre l'action de déplacement **avant** celle de mise à jour :
si le déplacement échoue, le statut ne change pas et le flux réessaiera au
prochain passage.

---

## 6. Rafraîchir le portail — facultatif

Comme pour WF-01 : si l'export tourne en tâche planifiée, il n'y a rien à faire.
Les clôtures de 00h15 seront en ligne à 00h30 au plus tard.

---

## Recette du flux

| # | Essai | Attendu |
|---|---|---|
| 1 | Avis `Publié`, clôture hier | Passe à `Clôturé` au prochain passage |
| 2 | Avis `Publié`, clôture dans trois jours | Inchangé |
| 3 | Offre RH clôturée par le flux | Dépôt de candidature refusé en `409` |
| 4 | Avis `Clôturé` depuis 40 jours | Passe à `Archivé`, pièces déplacées |
| 5 | Idem avec `GelArchivage` coché | **Inchangé** |
| 6 | Liste de plus de 100 avis échus | **Tous** traités, pas seulement 100 |
| 7 | Relancer le flux deux fois de suite | Second passage sans effet |

L'essai 6 est celui qu'on oublie et qui coûte le plus cher : il ne se manifeste
que le jour où le portail a grandi, longtemps après la mise en service. Le
provoquer maintenant, sur le site de recette, prend dix minutes — le script
`03-jeu-essai.ps1` peut servir de base pour générer le volume.

L'essai 7 vérifie l'idempotence : un flux planifié qui ne serait pas rejouable
sans dommage finit toujours par causer un incident, parce qu'il sera rejoué.

---

## Une fois WF-04 en service

Le portail devient **cohérent tout seul** : ce qui est ouvert l'est vraiment, ce
qui est clos le montre, et les archives se rangent.

Suite conseillée : **WF-08** (abonnements et double opt-in, EXG-32/33) — c'est
lui qui prévient les entreprises d'un nouvel avis, et donc lui qui fait la
différence entre un portail que l'on consulte et un portail qui travaille pour
vous. Le bloc d'abonnement du front est déjà écrit et attend son point d'entrée.
