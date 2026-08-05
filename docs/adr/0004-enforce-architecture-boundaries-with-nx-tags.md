# ADR-0004 — Frontières d'architecture appliquées par les tags Nx

**Statut** : Acceptée — Sprint 0
**Voir aussi** : [ADR-0001](0001-ddd-layering-for-services.md)

## Contexte

`docs/ARCHITECTURE.md` énonçait qu'« un package ne dépend jamais d'une app ni
d'un service » et qu'« une couche ne dépend que de couches situées au-dessus
d'elle ». Rien ne le vérifiait. Deux projets portaient bien des tags Nx
(`scope:foundation`, `layer:service`) mais aucune règle ne les lisait : ils
étaient purement décoratifs.

Une règle d'architecture qui repose sur la vigilance des relecteurs tient
quelques mois. Elle cède au premier import ajouté sous pression.

## Décision

Installer `@nx/eslint-plugin` et activer `@nx/enforce-module-boundaries`.

Chaque projet déclare deux tags dans son `package.json` :

- `layer:*` — sa place dans l'architecture, **contraint** ;
- `scope:*` — son domaine métier, **assigné mais non contraint**.

Les directions autorisées sont déclarées une seule fois, dans
`tools/eslint/module-boundaries.mjs` :

| Source           | Peut dépendre de             |
| ---------------- | ---------------------------- |
| `layer:util`     | rien                         |
| `layer:domain`   | rien                         |
| `layer:platform` | `util`                       |
| `layer:client`   | `util`                       |
| `layer:service`  | `domain`, `platform`, `util` |
| `layer:app`      | `client`, `domain`, `util`   |

Une entrée `sourceTag: '*'` interdit de dépendre d'un projet non tagué : un tag
oublié devient une erreur de lint au lieu d'un trou silencieux.

Chaque `eslint.config.mjs` de projet importe ce fragment. Il n'y a pas de
configuration ESLint à la racine : chaque projet lance `eslint` depuis son
propre répertoire, un fichier racine ne serait donc jamais lu.

**Pourquoi `scope:*` n'est pas contraint.** Avec un seul domaine métier
(`foundation`), une règle de scope n'interdirait rien qui existe et devrait
être réécrite dès l'arrivée d'un deuxième domaine. Les tags sont posés pour que
la contrainte puisse être ajoutée sans toucher aux `package.json`.

**Pourquoi les tags Nx ne suffisent pas.** Le graphe Nx voit des projets, pas
des répertoires : les quatre couches d'IAM sont un seul nœud. Le découpage
interne reste donc appliqué par `no-restricted-imports` dans
`services/foundation/iam/eslint.config.mjs`. Les deux mécanismes sont
complémentaires, pas redondants.

## Conséquences

**Ce qu'on gagne.** Une violation échoue en CI, sur la ligne fautive, avec le
nom de la règle enfreinte. La direction du graphe de dépendances devient une
propriété vérifiée du dépôt.

**Ce qu'on perd.** Une dépendance de développement supplémentaire
(`@nx/eslint-plugin` et ses 148 paquets transitifs) et un temps de lint plus
long : la règle construit le graphe de projets Nx.

**Un point de friction à prévoir.** `layer:domain` et `layer:util` ne peuvent
dépendre de rien. La première fois que `foundation` aura besoin d'un
utilitaire de `shared`, ce sera un arbitrage explicite — soit dupliquer
l'utilitaire, soit ouvrir la règle et le documenter ici. C'est voulu : ce genre
de décision doit être visible.

**Ce qui n'est pas couvert.** La règle ne voit que les imports statiques. Un
`require()` dynamique ou un import construit à l'exécution passe au travers.

## Validation

Les deux directions ont été testées en introduisant volontairement une
violation, puis en la retirant :

- `@nafa/foundation` important `@nafa/shared` →
  _A project tagged with "layer:domain" cannot depend on any libs with tags_
- `@nafa/platform` important `@nafa/foundation` →
  _A project tagged with "layer:platform" can only depend on libs tagged with "layer:util"_
