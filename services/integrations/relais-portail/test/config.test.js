'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { verifier, avertissements } = require('../src/config');

/* Configuration minimale valide : le strict nécessaire pour que
   `verifier` n'ait rien d'autre à reprocher que ce qu'on teste. */
function cfg(modifications = {}) {
  const base = {
    flux: { candidatures: 'https://exemple.invalid/wf05' },
    captcha: {
      fournisseur: 'turnstile',
      secret: 'secret-de-recette',
      desactivationAutorisee: false
    },
    clePartagee: 'cle',
    catalogue: { source: 'https://exemple.invalid/catalogue.json' },
    depot: {
      tailleMaxFichierOctets: 10 * 1024 * 1024,
      tailleMaxTotalOctets: 30 * 1024 * 1024
    }
  };
  return Object.assign(base, modifications, {
    captcha: Object.assign(base.captcha, modifications.captcha || {}),
    flux: Object.assign(base.flux, modifications.flux || {})
  });
}

test('une configuration complète ne signale rien', () => {
  assert.deepEqual(verifier(cfg()), []);
});

test('CAPTCHA désactivé sans autorisation refuse le démarrage', () => {
  const anomalies = verifier(
    cfg({ captcha: { fournisseur: 'aucun', secret: '' } })
  );

  /* Le point de la garde : sans elle, ce cas ne produisait qu'un
     avertissement, et un déploiement qui oublie CAPTCHA_FOURNISSEUR
     servait un formulaire public sans protection. */
  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /AUTORISER_SANS_CAPTCHA/);
});

test('CAPTCHA désactivé et assumé démarre', () => {
  const anomalies = verifier(
    cfg({
      captcha: {
        fournisseur: 'aucun',
        secret: '',
        desactivationAutorisee: true
      }
    })
  );

  /* Une recette n'a pas de clé à donner. L'autorisation explicite est
     là pour ce cas, pas pour être posée partout. */
  assert.deepEqual(anomalies, []);
});

test('un CAPTCHA assumé reste signalé à l’exploitant', () => {
  const messages = avertissements(
    cfg({
      captcha: {
        fournisseur: 'aucun',
        secret: '',
        desactivationAutorisee: true
      }
    })
  );

  /* Autoriser n'est pas taire : le service démarre, et le dit.  */
  assert.ok(messages.some((m) => /CAPTCHA désactivé/.test(m)));
});

test('un fournisseur déclaré sans secret refuse le démarrage', () => {
  const anomalies = verifier(cfg({ captcha: { secret: '' } }));

  assert.equal(anomalies.length, 1);
  assert.match(anomalies[0], /CAPTCHA_SECRET/);
});

test('un fournisseur inconnu refuse le démarrage', () => {
  const anomalies = verifier(cfg({ captcha: { fournisseur: 'friandise' } }));

  assert.match(anomalies[0], /CAPTCHA_FOURNISSEUR inconnu/);
});

test('un déclencheur WF-05 absent refuse le démarrage', () => {
  const anomalies = verifier(cfg({ flux: { candidatures: '' } }));

  assert.match(anomalies[0], /URL_FLUX_CANDIDATURES/);
});
