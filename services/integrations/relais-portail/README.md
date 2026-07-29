# relais-portail

Relais sécurisé entre le **portail public de l'AGEROUTE** et les flux Power Automate du back-office SharePoint (WF-05 pour les candidatures, WF-08 pour les abonnements).

Le cahier des charges interdit d'exposer les URL des déclencheurs Power Automate au navigateur (CDC §7.3). Ce service est le point d'entrée public : il vérifie, filtre, signe, puis relaie.

Aucune dépendance npm : Node.js 20 ou plus suffit.

## Ce qu'il fait avant tout appel à Power Automate

1. **Limitation de débit** par adresse — fenêtre glissante en mémoire (`limitation.js`).
2. **Vérification du CAPTCHA** — Turnstile, reCAPTCHA ou hCaptcha (`captcha.js`). Le jeton est consommé ici et n'est jamais relayé.
3. **Contrôles serveur** — formats, tailles, consentement, format des références (`validation.js`, exigences EXG-22 et EXG-23).
4. **Recevabilité de l'offre** — l'offre existe, son statut est « Publié » et sa date limite n'est pas dépassée (EXG-26), lu depuis le catalogue publié.
5. **Signature** — ajout de la clé partagée `x-cle-relais`, que le flux contrôle en première condition.

Les noms de pièces sont nettoyés (traversées de chemin neutralisées) et les caractères de contrôle retirés des champs texte avant transmission.

## Routes

| Méthode | Route | Flux appelé | Réponse |
|---|---|---|---|
| POST | `/api/candidatures` | WF-05 | `200 {"dossier":"CAND-2026-12345"}` |
| POST | `/api/abonnements` | WF-08 A | `202 {"message":"…"}` |
| POST | `/api/abonnements/confirmer` | WF-08 B | `200 {"message":"…"}` |
| POST | `/api/abonnements/desabonnement` | WF-08 C | `200 {"message":"…"}` |
| GET | `/api/sante` | — | état du service |

Codes de refus : `400` contrôle serveur, `403` CAPTCHA, `404` offre inconnue, `409` offre clôturée, `413` dossier trop volumineux, `429` quota dépassé, `502` flux injoignable, `503` service non configuré.

Un refus **métier** du flux (4xx) est retransmis tel quel au candidat ; une erreur interne (5xx) est masquée derrière un message générique.

## Démarrage

```bash
cp .env.example .env    # puis renseigner les valeurs issues du coffre
npm start
npm test                # 36 tests, sans réseau
```

Le service refuse de démarrer si `URL_FLUX_CANDIDATURES` manque, ou si un fournisseur CAPTCHA est déclaré sans secret. Les fonctions non configurées (abonnements par exemple) répondent proprement `503` au lieu de tomber en erreur.

## Déploiement

À publier sous la **même origine** que le front, sur `/api/` (reverse proxy). Aucune configuration CORS n'est alors nécessaire ; `ORIGINES_AUTORISEES` ne sert qu'aux déploiements séparés.

`RACINE_STATIQUE` permet à ce service de servir aussi le front (déploiement mono-serveur) avec les en-têtes de sécurité et la CSP déjà posés.

`PROXY_DE_CONFIANCE=true` uniquement derrière un proxy maîtrisé : sinon un client peut forger `X-Forwarded-For` et contourner la limitation de débit.

## Choix explicites

- **Catalogue injoignable.** Par défaut (`CATALOGUE_OBLIGATOIRE=false`), le dépôt est relayé et le contrôle de clôture est délégué à WF-05, qui l'effectue également. Passer à `true` pour bloquer plutôt que déléguer — plus strict, moins disponible.
- **État en mémoire.** La limitation de débit et le cache du catalogue sont locaux à l'instance. Pour plusieurs instances, remplacer `Limiteur` par un compteur partagé ; l'interface est prévue pour.
- **Taille du corps.** Un dossier de 30 Mo encodé en base64 pèse environ 41 Mo ; `TAILLE_MAX_CORPS_MO` vaut 48 par défaut et la lecture est interrompue au-delà.
