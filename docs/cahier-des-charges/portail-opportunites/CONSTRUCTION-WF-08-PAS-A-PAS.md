# WF-08 — Abonnements et double opt-in
# Feuille de construction pas à pas

Trois flux, pas un. Ce sont eux qui préviennent les entreprises d'un nouvel
avis — la différence entre un portail qu'on pense à consulter et un portail qui
travaille pour vous.

Ils portent **EXG-32** (double opt-in : personne n'est inscrit sans l'avoir
confirmé) et **EXG-33** (lien de désabonnement dans chaque message).

Le front et le relais sont **déjà écrits** pour ces trois flux. Le contrat
décrit ici est celui que le code applique aujourd'hui — relevé dans
`services/integrations/relais-portail/src/`, pas dans une spécification. Si les
deux divergeaient, c'est le code qui a raison.

---

## Avant de commencer

| Prérequis | Vérification |
|---|---|
| Solution `AGR-PRT-Automatisation` | Power Automate → Solutions |
| Licence **Premium** sur `svc-portail@ageroute.gov.gn` | Les trois déclencheurs sont HTTP |
| Liste `Liste-Abonnes` créée | Script 01 |
| Héritage de permissions rompu sur cette liste | Script 01 — ce sont des données personnelles |
| Clé partagée au coffre | La même que WF-05 |

### Colonnes de `Liste-Abonnes`

| Colonne | Type | Note |
|---|---|---|
| `CourrielAbonne` | Texte | indexé, unique |
| `ThemeAbonne` | Choix | `AO` / `Recrutement` / `Les deux` |
| `StatutAbonne` | Choix | `En attente` / `Confirmé` / `Désabonné` |
| `JetonConfirmation` | Texte | indexé |
| `DateInscription` | Date | |
| `DateConsentement` | Date | la preuve du consentement — EXG-32 |

---

## Le contrat, tel que le relais l'applique

| Route du relais | Flux appelé | Charge utile envoyée |
|---|---|---|
| `POST /api/abonnements` | **A — Inscription** | `{ "courriel": "…", "theme": "AO\|Recrutement\|Les deux", "consentement": true }` |
| `POST /api/abonnements/confirmer` | **B — Confirmation** | `{ "jeton": "…" }` |
| `POST /api/abonnements/desabonnement` | **C — Désabonnement** | `{ "jeton": "…" }` |

En-tête sur les trois : `x-cle-relais: <clé partagée>` — nom réglable par
`ENTETE_CLE_PARTAGEE`, mais aucune raison de le changer.

Ce que le relais garantit **avant** d'appeler le flux, et qu'il est donc inutile
de refaire :

- l'adresse est syntaxiquement valide et mise en minuscules ;
- `consentement` vaut exactement `true`, sinon `400` (EXG-32) ;
- `theme` est l'une des trois valeurs, sinon ramené à `Les deux` ;
- le jeton correspond à `^[A-Za-z0-9-]{8,}$` ;
- pas plus de **10 inscriptions par heure et par adresse IP**.

Ce que le flux doit refaire quand même : **le contrôle de la clé partagée**. Le
déclencheur HTTP est public ; sans ce contrôle, n'importe qui inscrit n'importe
quelle adresse.

---

## Flux A — Inscription

Nom : `AGR-PRT-WF08A-Inscription-Abonne`

### A.1 Déclencheur — Requête HTTP reçue

Schéma JSON de la charge utile :

```json
{
  "type": "object",
  "properties": {
    "courriel": { "type": "string" },
    "theme": { "type": "string" },
    "consentement": { "type": "boolean" }
  }
}
```

### A.2 Contrôle de la clé partagée

**Condition** :

```
@equals(triggerOutputs()?['headers']?['x-cle-relais'], 'VOTRE-CLE')
```

Branche **Non** → **Réponse** `401`, et rien d'autre.

> Mettre la clé dans une **variable d'environnement** de la solution, pas en
> dur : sinon elle voyage dans l'export vers la production et se retrouve en
> clair dans un fichier que plusieurs personnes manipulent.

### A.3 Chercher l'adresse

**Obtenir les éléments** sur `Liste-Abonnes` :

```
CourrielAbonne eq '@{triggerBody()?['courriel']}'
```

### A.4 Le cas « déjà confirmé » — et pourquoi il compte

**Condition** : `length(body('Obtenir_les_éléments')?['value'])` > 0
**et** le premier élément a `StatutAbonne` = `Confirmé`.

→ **Réponse `200`**, sans rien créer, sans renvoyer de courriel.

C'est un choix de sécurité, pas une paresse. Si le flux répondait « cette
adresse est déjà inscrite », n'importe qui pourrait tester des adresses une par
une et savoir lesquelles sont abonnées aux marchés publics de l'Agence. La
réponse doit être **identique** qu'on vienne de créer un abonnement ou non.

### A.5 Créer ou réactiver

Sinon — adresse inconnue, ou connue mais `En attente` / `Désabonné` :

1. **Composer** un jeton : `@{guid()}`
2. Selon le cas, **Créer un élément** ou **Mettre à jour l'élément** :

| Colonne | Valeur |
|---|---|
| `CourrielAbonne` | `@{triggerBody()?['courriel']}` |
| `ThemeAbonne` | `@{triggerBody()?['theme']}` |
| `StatutAbonne` | `En attente` |
| `JetonConfirmation` | `@{outputs('Composer_le_jeton')}` |
| `DateInscription` | `@{utcNow()}` |
| `DateConsentement` | **laisser vide** |

`DateConsentement` ne se renseigne qu'à la confirmation. C'est cette date qui
prouve le double opt-in : la renseigner ici viderait EXG-32 de son sens.

### A.6 Envoyer le courriel de confirmation

**Envoyer un courriel (V2)** à `@{triggerBody()?['courriel']}` :

> **Objet** : Confirmez votre abonnement aux publications de l'AGEROUTE
>
> Vous avez demandé à recevoir les avis de marché et offres d'emploi de
> l'Agence de Gestion des Routes. Cliquez pour confirmer :
>
> `https://opportunites.ageroute.gov.gn/confirmer.html?jeton=@{outputs('Composer_le_jeton')}`
>
> Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :
> aucun envoi ne vous sera fait sans confirmation.

Cette dernière phrase n'est pas une politesse. Une adresse peut être inscrite
par un tiers ; le double opt-in fait qu'il ne se passe rien, et le destinataire
doit le savoir plutôt que de craindre d'être fiché.

### A.7 Réponse

**Réponse** `202` — le relais l'attend. Corps :

```json
{ "message": "Vérifiez votre boîte de réception pour confirmer l'abonnement." }
```

---

## Flux B — Confirmation

Nom : `AGR-PRT-WF08B-Confirmation-Abonne`

Déclencheur HTTP, schéma `{ "jeton": "string" }`, même contrôle de clé qu'en A.2.

### B.1 Retrouver l'abonné

**Obtenir les éléments** :

```
JetonConfirmation eq '@{triggerBody()?['jeton']}'
```

Aucun résultat → **Réponse `400`**, message **neutre** :
`{ "message": "Ce lien n'est plus valide." }`

Ne pas distinguer « jeton inconnu » de « jeton déjà utilisé » : la différence
n'aide que celui qui cherche à deviner des jetons.

### B.2 Confirmer

**Mettre à jour l'élément** :

| Colonne | Valeur |
|---|---|
| `StatutAbonne` | `Confirmé` |
| `DateConsentement` | `@{utcNow()}` |
| `JetonConfirmation` | **chaîne vide** |

L'effacement du jeton le rend à usage unique. Un jeton de confirmation qui reste
valide indéfiniment finit dans un historique de navigateur, un journal de proxy
ou un courriel transféré.

> **Mais** : le jeton sert aussi au désabonnement (flux C), et le lien de
> désabonnement doit rester valable **à vie** (EXG-33). Il faut donc en émettre
> un second, distinct, à la confirmation — et c'est celui-là que les envois de
> WF-01/02/06 mettront dans leurs messages.
>
> Deux façons : ajouter une colonne `JetonDesabonnement`, ou réécrire
> `JetonConfirmation` avec un nouveau GUID qui ne servira plus qu'au
> désabonnement. La première est plus claire à relire dans six mois ; la seconde
> évite de toucher au schéma. **Choisir, et l'écrire dans la description du
> flux** — c'est le point où un repreneur se trompera sinon.

### B.3 Réponse

`200` — `{ "message": "Votre abonnement est confirmé." }`

---

## Flux C — Désabonnement

Nom : `AGR-PRT-WF08C-Desabonnement`

Identique à B, à trois différences :

1. recherche sur le jeton de désabonnement ;
2. `StatutAbonne = Désabonné` ;
3. **on n'efface pas le jeton** — sinon un second clic sur le lien, réflexe
   courant, renverrait une erreur à quelqu'un qui a simplement voulu partir.
   L'opération doit être idempotente.

Jeton inconnu → `200` quand même, avec « Vous ne recevrez plus nos
publications. » Répondre `400` à quelqu'un qui se désabonne est une mauvaise
manière : il n'a pas à savoir pourquoi le lien ne marche plus, il veut
seulement ne plus rien recevoir.

---

## Ce que les envois doivent faire — EXG-33

Les flux qui envoient aux abonnés (WF-01, WF-02, WF-06) lisent :

```
StatutAbonne eq 'Confirmé' and (ThemeAbonne eq 'AO' or ThemeAbonne eq 'Les deux')
```

Et, dans **chaque** message :

- destinataires en **Cci**, par lots de 100 — sans quoi vous diffusez à toutes
  les entreprises la liste de leurs concurrentes ;
- un lien de désabonnement **personnel** :
  `https://opportunites.ageroute.gov.gn/desabonnement.html?jeton=@{items('Boucle')?['JetonDesabonnement']}`

Le lot de 100 en Cci et le lien personnel se contredisent en apparence : un
message unique ne peut pas porter un lien différent par destinataire. Deux
sorties possibles :

- **un envoi par abonné** — le lien est personnel, mais c'est une action Power
  Automate par destinataire, donc du quota ;
- **des lots, avec un lien générique** vers `desabonnement.html` sans jeton, où
  l'usager saisit son adresse — moins direct, mais tenable.

Pour le volume attendu — quelques dizaines à quelques centaines d'abonnés — le
premier montage est le bon, et le plus respectueux. Basculer sur le second si la
liste dépasse le millier.

---

## Recette des trois flux

| # | Essai | Attendu |
|---|---|---|
| 1 | Appel sans `x-cle-relais` | `401`, aucun élément créé |
| 2 | Inscription d'une adresse neuve | `202`, élément `En attente`, courriel reçu |
| 3 | Clic sur le lien de confirmation | `Confirmé`, `DateConsentement` renseignée, jeton de confirmation vidé |
| 4 | Re-clic sur le même lien | `400` neutre, statut inchangé |
| 5 | Réinscription d'une adresse déjà `Confirmé` | `200`, **aucun courriel**, aucun doublon |
| 6 | Désabonnement | `Désabonné` |
| 7 | Re-clic sur le lien de désabonnement | `200`, pas d'erreur |
| 8 | Réinscription après désabonnement | Nouveau cycle `En attente` → confirmation |
| 9 | Envoi test à trois abonnés | Trois messages, aucune adresse visible des autres |

Les essais 4, 5 et 7 sont ceux qu'on oublie et qui font mauvaise impression sur
un site public : une erreur affichée à quelqu'un qui a simplement cliqué deux
fois.

L'essai 9 est le seul dont l'échec est grave : diffuser le carnet d'adresses
des soumissionnaires est un incident de données personnelles, pas une gêne.

---

## Mettre en service côté relais

Une fois les trois flux publiés, renseigner dans `/etc/relais-portail/env` :

```
URL_FLUX_ABONNEMENT=https://…/flux-A
URL_FLUX_CONFIRMATION=https://…/flux-B
URL_FLUX_DESABONNEMENT=https://…/flux-C
CLE_PARTAGEE=<la clé du coffre>
```

Puis remettre les points d'entrée dans `assets/config.js` du portail :

```js
pointEntreeAbonnements: '/api/abonnements',
```

Le bloc d'abonnement, aujourd'hui masqué, réapparaît de lui-même.

> Ces URL sont des **secrets d'exploitation** (CDC §7.3) : fichier en mode 600,
> propriétaire root, et jamais dans le dépôt. La CI refuse d'ailleurs toute
> publication qui en contiendrait une.

---

## Une fois WF-08 en service

Il reste **WF-02** (additifs et clarifications), **WF-03** (alertes de clôture
J-7 / J-2), **WF-06** (publication des attributions) et **WF-09** (purge des
candidatures — conservation limitée, à ne pas oublier : c'est une obligation,
pas une option). Leurs spécifications figurent dans
`CONSTRUCTION-FLUX-POWER-AUTOMATE.md`.
