# WF-05 — Réception d'une candidature
# Feuille de construction pas à pas

Le flux qui reçoit les candidatures du portail public. C'est le plus structurant :
il porte trois exigences du cahier des charges (EXG-22, EXG-23, EXG-26) et c'est
le seul point d'entrée public en écriture sur le back-office.

Le relais (`services/integrations/relais-portail`) est déjà écrit pour dialoguer
avec lui : le contrat d'échange décrit ici est celui qu'il applique.

---

## Avant de commencer

| Prérequis | Vérification |
|---|---|
| Solution `AGR-PRT-Automatisation` créée | Power Automate → Solutions |
| Connexion SharePoint portée par `svc-portail@ageroute.gov.gn` | Jamais un compte nominatif |
| Licence Power Automate Premium sur ce compte | Le déclencheur HTTP l'exige |
| Site provisionné | `AGR-PRT-Opportunites-Recette` |
| Une clé partagée tirée au hasard, consignée au coffre | Ex. `New-Guid` |

Créer le flux **dans la solution**, pas à la racine : sans cela, l'export vers la
production sera impossible.

> Solutions → `AGR-PRT-Automatisation` → Nouveau → Automatisation → Flux de cloud → Instantané

Nom : `AGR-PRT-WF05-Reception-Candidature`

---

## 1. Déclencheur — Requête HTTP reçue

Remplacer le déclencheur instantané par **Lors de la réception d'une requête HTTP**.

**Méthode** : `POST`

**Schéma JSON de la demande** — coller tel quel :

```json
{
  "type": "object",
  "properties": {
    "offreRef": { "type": "string" },
    "nom": { "type": "string" },
    "prenom": { "type": "string" },
    "courriel": { "type": "string" },
    "telephone": { "type": "string" },
    "consentement": { "type": "boolean" },
    "pieces": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nom": { "type": "string" },
          "contenuBase64": { "type": "string" }
        },
        "required": [ "nom", "contenuBase64" ]
      }
    }
  },
  "required": [ "offreRef", "nom", "prenom", "courriel", "consentement", "pieces" ]
}
```

L'URL du déclencheur n'apparaît qu'après la première sauvegarde. **C'est un secret
d'exploitation** : la consigner au coffre et la renseigner dans la variable
`URL_FLUX_CANDIDATURES` du relais. Elle ne doit jamais figurer dans le dépôt.

---

## 2. Contrôle de la clé partagée

Première action après le déclencheur, avant tout traitement.

**Condition** — nommer `Cle partagee valide`

Champ gauche (mode expression) :
```
triggerOutputs()?['headers']?['x-cle-relais']
```
Opérateur : `est égal à` — Champ droit : la valeur du coffre.

**Branche « Si non »** :
1. *Réponse* → Code d'état `401`, corps :
   ```json
   { "message": "Non autorisé." }
   ```
2. *Terminer* → État `Failed`.

Tout le reste du flux se construit dans la branche **« Si oui »**.

> Un appel direct au déclencheur, sans passer par le relais, est ainsi inopérant
> même si son URL venait à fuiter (CDC §7.3).

---

## 3. Contrôle du consentement — EXG-23

**Condition** — `Consentement donne`

```
triggerBody()?['consentement']
```
`est égal à` → expression `true` (booléen, pas la chaîne « true »).

**Si non** : *Réponse* `400` avec
```json
{ "message": "Le consentement au traitement des données est obligatoire." }
```
puis *Terminer* en `Failed`.

---

## 4. Contrôle de recevabilité de l'offre — EXG-26

**Action** : SharePoint → *Obtenir les éléments*
- Adresse du site : celle du site de gestion
- Nom de la liste : `Liste-Recrutements`
- Requête de filtre :
  ```
  ReferenceRH eq '@{triggerBody()?['offreRef']}'
  ```
- Nombre maximal d'éléments : `1`

**Condition** — `Offre recevable`, en mode expression avancé :

```
@and(
  greater(length(body('Obtenir_les_elements')?['value']), 0),
  equals(first(body('Obtenir_les_elements')?['value'])?['StatutRH']?['Value'], 'Publié'),
  greater(first(body('Obtenir_les_elements')?['value'])?['DateLimite'], utcNow())
)
```

**Si non** : *Réponse* `409` avec
```json
{ "message": "Cette offre est clôturée : les candidatures ne sont plus recevables." }
```
puis *Terminer* en `Failed`.

> Les trois conditions comptent. Le statut seul ne suffit pas : WF-04 ne bascule
> les offres en « Clôturé » qu'à 00h15, il existe donc une fenêtre où une offre
> dépassée porte encore le statut « Publié ». La comparaison de date la couvre.

---

## 5. Contrôle des pièces — EXG-22

**Initialiser une variable** `TailleTotale` — type Entier — valeur `0`
**Initialiser une variable** `PiecesValides` — type Booléen — valeur `true`

**Appliquer à chacun** sur `triggerBody()?['pieces']`, contenant une **Condition** :

```
@and(
  contains(
    createArray('pdf','docx','jpg','jpeg','png'),
    toLower(last(split(items('Appliquer_a_chacun')?['nom'], '.')))
  ),
  lessOrEquals(
    div(mul(length(items('Appliquer_a_chacun')?['contenuBase64']), 3), 4),
    10485760
  )
)
```

**Si non** : *Définir la variable* `PiecesValides` = `false`
**Si oui** : *Incrémenter la variable* `TailleTotale` de
```
div(mul(length(items('Appliquer_a_chacun')?['contenuBase64']), 3), 4)
```

Après la boucle, **Condition** `Pieces conformes` :
```
@and(variables('PiecesValides'), lessOrEquals(variables('TailleTotale'), 31457280))
```

**Si non** : *Réponse* `400` avec
```json
{ "message": "Les pièces ne respectent pas les formats ou les tailles autorisés." }
```
puis *Terminer* en `Failed`.

> `length` d'une chaîne base64 multiplié par 3 puis divisé par 4 donne la taille
> décodée à trois octets près — suffisant pour un plafond. 10485760 = 10 Mo,
> 31457280 = 30 Mo.

---

## 6. Numéro de dossier unique — EXG-24

**Initialiser une variable** `NumeroDossier` — Chaîne :
```
concat('CAND-', formatDateTime(utcNow(), 'yyyy'), '-', rand(10000, 99999))
```

**Jusqu'à** (boucle) — condition d'arrêt :
```
@equals(length(body('Verifier_unicite')?['value']), 0)
```
Nombre d'itérations : `10`

Dans la boucle :
1. SharePoint → *Obtenir les éléments*, renommée `Verifier unicite`
   - Liste : `Liste-Candidatures`
   - Filtre : `NumeroDossier eq '@{variables('NumeroDossier')}'`
2. **Condition** : si `length(body('Verifier_unicite')?['value'])` est supérieur à `0`
   → *Définir la variable* `NumeroDossier` avec la même expression que ci-dessus.

> La colonne `NumeroDossier` porte une contrainte d'unicité SharePoint posée par
> le script 01 : si cette boucle laissait passer une collision, la création
> échouerait franchement au lieu de produire deux dossiers homonymes.

---

## 7. Dépôt des pièces

**Action** : SharePoint → *Créer un fichier*, dans un **Appliquer à chacun** sur
`triggerBody()?['pieces']` :

- Chemin du dossier :
  ```
  /Candidatures/@{variables('NumeroDossier')}
  ```
- Nom du fichier : `items('Appliquer_a_chacun_2')?['nom']`
- Contenu du fichier (mode expression) :
  ```
  base64ToBinary(items('Appliquer_a_chacun_2')?['contenuBase64'])
  ```

SharePoint crée le dossier à la volée s'il n'existe pas.

---

## 8. Enregistrement de la candidature

**Action** : SharePoint → *Créer un élément*
- Liste : `Liste-Candidatures`

| Colonne | Valeur |
|---|---|
| Titre | `variables('NumeroDossier')` |
| Numéro de dossier | `variables('NumeroDossier')` |
| Nom | `triggerBody()?['nom']` |
| Prénom | `triggerBody()?['prenom']` |
| Courriel | `triggerBody()?['courriel']` |
| Téléphone | `triggerBody()?['telephone']` |
| Date de dépôt | `utcNow()` |
| Consentement au traitement | `Oui` |
| Statut du dossier | `Reçu` |
| Offre liée Id | `first(body('Obtenir_les_elements')?['value'])?['ID']` |

---

## 9. Accusé de réception — EXG-24

**Action** : Office 365 Outlook → *Envoyer un courriel (V2)*

- À : `triggerBody()?['courriel']`
- Objet : `Accusé de réception de votre candidature — @{variables('NumeroDossier')}`
- Corps :

```
Bonjour @{triggerBody()?['prenom']} @{triggerBody()?['nom']},

Votre candidature à l'offre @{triggerBody()?['offreRef']} a bien été enregistrée.

Numéro de dossier : @{variables('NumeroDossier')}

Conservez ce numéro : il vous sera demandé pour tout échange avec l'Agence.
Aucune pièce complémentaire ne peut être ajoutée après le dépôt.

Les candidatures sont examinées après la date limite. Seuls les candidats
retenus seront contactés.

AGEROUTE Guinée — Agence de Gestion des Routes
Ce message est automatique, merci de ne pas y répondre.
```

Puis un second *Envoyer un courriel (V2)* au groupe RH, avec le lien vers
l'élément créé.

---

## 10. Réponse au candidat

**Action** : *Réponse* — code `200`, corps :

```json
{
  "dossier": "@{variables('NumeroDossier')}"
}
```

C'est ce champ `dossier` que le relais retransmet au navigateur, et que le portail
affiche en gros au candidat.

---

## 11. Gestion des erreurs

Sélectionner toutes les actions à partir de l'étape 6, puis *Regrouper dans une
étendue* nommée `Traitement`.

Ajouter après elle une action *Envoyer un courriel (V2)* configurée pour
s'exécuter **« a échoué »** (menu ⋯ → Configurer l'exécution après) :

- À : `dsi-supervision@ageroute.gov.gn`
- Objet : `[WF-05] Échec de réception d'une candidature`
- Corps : `result('Traitement')`

---

## Recette du flux

| # | Essai | Attendu |
|---|---|---|
| 1 | Appel sans en-tête `x-cle-relais` | `401`, aucun dossier créé |
| 2 | Dépôt conforme sur une offre ouverte | `200` avec un numéro, dossier dans la bibliothèque, courriel reçu |
| 3 | `consentement: false` | `400` |
| 4 | Pièce `.exe` | `400` |
| 5 | Pièce de 25 Mo | `400` |
| 6 | Dépôt sur `RH/2026/002` (résultats publiés) | `409` |
| 7 | Compte DPMP tentant d'ouvrir `Liste-Candidatures` | Accès refusé |

Les essais 1, 3, 4, 5 et 6 sont déjà couverts côté relais par sa suite
automatisée : les rejouer ici vérifie que le flux refuse **aussi** de son propre
chef, sans dépendre du relais.

Pour l'essai 2, le plus simple est de lancer le relais localement en le pointant
sur ce flux :

```bash
cd services/integrations/relais-portail
URL_FLUX_CANDIDATURES="<url du declencheur>" \
CLE_PARTAGEE="<cle du coffre>" \
CAPTCHA_FOURNISSEUR=aucun \
SOURCE_CATALOGUE=../../../apps/web/portail-opportunites/public/data/opportunites.json \
RACINE_STATIQUE=../../../apps/web/portail-opportunites/public \
npm start
```

Puis ouvrir `http://localhost:8080`, onglet Recrutement, et déposer une
candidature de test sur `RH/2026/001`.

---

## Une fois WF-05 en service

Renseigner la variable `URL_FLUX_CANDIDATURES` du relais, puis construire les
flux suivants dans l'ordre conseillé : WF-01, WF-04, WF-07, WF-08, WF-02, WF-03,
WF-06, WF-09. Leurs spécifications figurent dans
`CONSTRUCTION-FLUX-POWER-AUTOMATE.md`.
