# Jeu d'archives — avis réels de l'AGEROUTE

Ce répertoire est **versionné**, contrairement à `public/data/` et
`public/documents/` que le `.gitignore` écarte. La distinction est
volontaire :

- `public/data/` et `public/documents/` reçoivent la **sortie machine** du
  script `02-export-publication.ps1`. Une sortie de script n'a rien à faire
  dans un dépôt : elle est régénérée à chaque cycle.
- `archives/` contient une **source constituée à la main** : douze avis réels
  de l'Agence, tous clos, reconstitués depuis les avis officiels signés. Elle
  ne se régénère pas — si elle est perdue, elle est perdue.

Provenance de chaque entrée : `SOURCES.md`.

## Mettre ce jeu en ligne

```bash
cp archives/data/opportunites.json public/data/
cp -r archives/documents/*          public/documents/
```

Le premier export SharePoint réel écrasera `public/data/opportunites.json`.
C'est le comportement voulu : ces archives ouvrent le portail, elles ne le
gouvernent pas.
