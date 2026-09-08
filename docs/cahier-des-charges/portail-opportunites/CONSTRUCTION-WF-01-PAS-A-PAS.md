# WF-01 — Validation et publication d'un avis
# Feuille de construction pas à pas

Le flux qui fait passer un avis de « En validation » à « Publié ». C'est lui qui
ouvre le robinet : tant qu'il n'existe pas, vos agents peuvent saisir dans
SharePoint, mais rien n'atteint jamais le portail.

Il porte **EXG-41** : aucun contenu ne doit être publié sans une approbation
tracée. Sur un portail de marchés publics, c'est l'exigence qui protège
l'Agence — un avis erroné mis en ligne sans validation engage sa responsabilité.

---

## Avant de commencer

| Prérequis | Vérification |
|---|---|
| Solution `AGR-PRT-Automatisation` créée | Power Automate → Solutions |
| Connexion SharePoint portée par `svc-portail@ageroute.gov.gn` | **Jamais** un compte nominatif |
| Groupe `AGR-PRT-Valideurs` peuplé | `.\04-peupler-groupes.ps1 -Etat` |
| Site provisionné | `AGR-PRT-Opportunites-Recette` d'abord |

**Pourquoi jamais un compte nominatif** : le flux tourne sous l'identité de la
connexion. Le jour où cette personne quitte l'Agence, tous les flux s'arrêtent —
et la publication des avis de marché avec eux.

Créer le flux **dans la solution**, pas à la racine : sinon l'export vers la
production sera impossible.

> Solutions → `AGR-PRT-Automatisation` → Nouveau → Automatisation → Flux de cloud → Automatisé

Nom : `AGR-PRT-WF01-Validation-AppelsOffres`

---

## 1. Déclencheur — Lorsqu'un élément est créé ou modifié

| Champ | Valeur |
|---|---|
| Adresse du site | `https://ageroutegn.sharepoint.com/sites/AGR-PRT-Opportunites-Recette` |
| Nom de la liste | `Liste-AppelsOffres` |

### La condition de déclenchement — à ne pas sauter

`…` en haut à droite du déclencheur → **Paramètres** → **Conditions de
déclenchement** → ajouter :

```
@equals(triggerOutputs()?['body/StatutAO/Value'], 'En validation')
```

**Ce que cela évite.** Le flux modifie l'élément à la fin (il écrit
`StatutAO = Publié`). Or le déclencheur écoute *toute* modification. Sans cette
condition, le flux se rappellerait lui-même : boucle infinie, quota Power
Automate épuisé en quelques minutes, et une centaine de courriels envoyés aux
abonnés pour un seul avis.

La condition résout le problème par construction : ni « Publié » ni
« Brouillon » ne valent « En validation », donc l'écriture finale ne redéclenche
rien.

### Le `/Value` qui fait perdre une heure

`StatutAO` est une colonne de type Choix. Power Automate l'expose comme un objet,
pas comme une chaîne. `body/StatutAO` renvoie un objet et la comparaison échoue
sans erreur — le flux ne se déclenche simplement jamais, ce qui est le plus
difficile à diagnostiquer. C'est bien `body/StatutAO/Value` qu'il faut.

### Concurrence

Toujours dans **Paramètres** : **Contrôle de la concurrence** → activé, degré
de parallélisme **1**.

Deux validations simultanées sur le même avis produiraient deux approbations
concurrentes et un état final indéterminé. Le débit n'est pas un enjeu ici :
quelques avis par semaine.

---

## 2. Démarrer et attendre une approbation

Action : **Approbations → Démarrer et attendre une approbation**

| Champ | Valeur |
|---|---|
| Type d'approbation | **Approuver/Rejeter — Première réponse** |
| Titre | `Validation — @{triggerOutputs()?['body/ReferenceAO']}` |
| Affecté à | voir ci-dessous |

### Pourquoi « Première réponse » et non « Tout le monde doit approuver »

Un avis de marché ne doit pas attendre le retour de trois personnes pour sortir.
« Tout le monde doit approuver » bloque la publication dès qu'un valideur est en
mission — situation courante. La traçabilité est identique : l'historique
nomme qui a approuvé.

### Affecté à — un groupe ne suffit pas

Le champ **Affecté à** n'accepte pas un groupe SharePoint. Deux options :

**a. Lister les adresses**, séparées par des points-virgules. Simple, mais à
maintenir à la main à chaque mouvement de personnel.

**b. Lire le groupe** — ajouter avant l'approbation une action **SharePoint →
Envoyer une requête HTTP à SharePoint** :

```
Méthode : GET
URI     : _api/web/sitegroups/getbyname('AGR-PRT-Valideurs')/users
En-têtes: Accept = application/json;odata=nometadata
```

puis, dans **Affecté à** :

```
@{join(body('Envoyer_une_requête_HTTP_à_SharePoint')?['value'], ';')}
```

L'option **b** demande dix minutes de plus et évite d'oublier une mise à jour le
jour où un valideur change de poste. C'est celle que je recommande.

### Détails de la demande

Champ **Détails**, en Markdown — le valideur doit pouvoir décider sans ouvrir
SharePoint :

```
**Objet** : @{triggerOutputs()?['body/Title']}
**Référence** : @{triggerOutputs()?['body/ReferenceAO']}
**Type** : @{triggerOutputs()?['body/TypeMarche/Value']}
**Clôture** : @{triggerOutputs()?['body/DateCloture']}
**Bailleur** : @{triggerOutputs()?['body/BailleurAO/Label']}

[Ouvrir l'avis dans SharePoint](@{triggerOutputs()?['body/{Link}']})
```

Noter `/Label` pour `BailleurAO` : les colonnes de métadonnées gérées exposent
`Label`, pas `Value`. Ce n'est pas la même chose que pour un champ Choix — c'est
la deuxième source d'erreur la plus fréquente sur ces flux.

---

## 3. Condition — le résultat de l'approbation

Action : **Contrôle → Condition**

```
@{outputs('Démarrer_et_attendre_une_approbation')?['body/outcome']}   est égal à   Approve
```

`Approve` s'écrit **sans accent et sans « d »** : c'est une valeur d'API, pas un
libellé traduit. `Approuver` ne correspondra jamais.

---

## 4. Branche « Oui » — publier

### 4.1 Mettre à jour l'élément

Action : **SharePoint → Mettre à jour l'élément**

| Champ | Valeur |
|---|---|
| Id | `@{triggerOutputs()?['body/ID']}` |
| Statut | `Publié` |
| Date de publication | voir ci-dessous |

Pour `DatePublication`, ne pas écraser une date déjà saisie — un avis republié
après correction garde sa date d'origine :

```
@{if(empty(triggerOutputs()?['body/DatePublication']), utcNow('yyyy-MM-dd'), triggerOutputs()?['body/DatePublication'])}
```

> **Attention** : dans « Mettre à jour l'élément », tout champ laissé vide est
> effacé sur l'élément. Reporter systématiquement les valeurs du déclencheur
> pour les colonnes que le flux ne modifie pas. C'est la façon la plus courante
> de perdre une description soigneusement rédigée.

### 4.2 Prévenir le contributeur

**Envoyer un courriel (V2)** à `@{triggerOutputs()?['body/Author/Email']}` :

> Objet : `Avis publié — @{triggerOutputs()?['body/ReferenceAO']}`
>
> Votre avis a été approuvé et publié. Il apparaîtra sur
> `opportunites.ageroute.gov.gn` à la prochaine synchronisation, sous quinze
> minutes.

### 4.3 Déclencher la publication — facultatif

Si la publication tourne par **tâche planifiée** (`07-mise-en-service.ps1
-Planifier`), il n'y a **rien à faire ici** : l'avis partira au prochain cycle,
dans le quart d'heure.

N'ajouter un appel HTTP vers WF-07 que si l'on veut une mise en ligne immédiate.
Le gain — une dizaine de minutes sur un avis dont la clôture est à trois
semaines — justifie rarement la dépendance supplémentaire.

---

## 5. Branche « Non » — renvoyer au contributeur

### 5.1 Remettre en brouillon

**Mettre à jour l'élément** → `StatutAO = Brouillon`, mêmes précautions qu'en 4.1.

### 5.2 Transmettre le motif

**Envoyer un courriel (V2)** à l'auteur, en reprenant les commentaires du
valideur :

```
@{outputs('Démarrer_et_attendre_une_approbation')?['body/responses'][0]['comments']}
```

Un rejet sans motif oblige le contributeur à faire le tour des bureaux. Rendre
le champ Commentaires obligatoire n'est pas possible dans l'action d'approbation ;
le rappeler dans les détails de la demande est le seul levier.

---

## 6. Dupliquer pour les recrutements

Le déclencheur SharePoint est lié à **une** liste : un seul flux ne peut pas
couvrir les deux. Il faut un second flux.

> `…` sur le flux → **Enregistrer sous** → `AGR-PRT-WF01-Validation-Recrutements`

Puis, dans la copie, remplacer **partout** :

| Dans WF-01 Appels d'offres | Dans WF-01 Recrutements |
|---|---|
| `Liste-AppelsOffres` | `Liste-Recrutements` |
| `StatutAO` | `StatutRH` |
| `ReferenceAO` | `ReferenceRH` |
| `TypeMarche` | `TypeContrat` |
| `DateCloture` | `DateLimite` |
| `BailleurAO` | `DirectionRH` |

Reprendre aussi la **condition de déclenchement** : elle contient `StatutAO`.
C'est l'oubli le plus fréquent de cette duplication — le flux se déclenche alors
sur toute modification, et la boucle revient.

---

## Recette du flux — EXG-41

| # | Essai | Attendu |
|---|---|---|
| 1 | Créer un avis, statut `Brouillon` | Aucun déclenchement |
| 2 | Passer à `En validation` | Demande reçue par les valideurs |
| 3 | Approuver | `Publié`, `DatePublication` renseignée, courriel à l'auteur |
| 4 | Vérifier l'historique du flux | L'approbateur et l'horodatage y figurent |
| 5 | Rejeter un autre avis avec commentaire | `Brouillon`, courriel portant le motif |
| 6 | Modifier un avis déjà `Publié` | **Aucun déclenchement** — c'est le test anti-boucle |
| 7 | Passer un avis à `Publié` à la main, sans validation | Possible, mais sans trace d'approbation |

L'essai 6 est le plus important : s'il déclenche, la condition de déclenchement
est mal posée et il faut arrêter le flux avant qu'il ne consomme le quota.

L'essai 7 révèle une limite qu'il faut connaître : **rien n'empêche
techniquement** un membre de `AGR-PRT-Valideurs` de passer un avis à « Publié »
directement dans SharePoint. EXG-41 est satisfaite par la traçabilité, pas par
un verrou. Pour un verrou réel il faudrait retirer le droit de modification de
la colonne Statut et ne l'accorder qu'à l'identité du flux — durcissement
possible plus tard, à décider avec la DPMP.

---

## Une fois WF-01 en service

Vos agents peuvent publier. La chaîne est alors complète de bout en bout :

```
saisie  →  validation (WF-01)  →  export (script 02)  →  dépôt  →  portail
```

Suite conseillée : **WF-04** — clôture et archivage automatiques. Sans lui, un
avis clos reste affiché comme ouvert. Sa feuille pas à pas est écrite :
`CONSTRUCTION-WF-04-PAS-A-PAS.md`.

Puis **WF-08** (abonnements), puis les autres, dont les spécifications figurent
dans `CONSTRUCTION-FLUX-POWER-AUTOMATE.md`.
