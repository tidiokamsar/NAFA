'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Limiteur, adresseClient } = require('../src/limitation');

test('le limiteur autorise jusqu\'au maximum puis refuse', () => {
  const l = new Limiteur(3, 60000);
  const t = 1000000;
  assert.equal(l.consommer('ip', t).autorise, true);
  assert.equal(l.consommer('ip', t + 1).autorise, true);
  assert.equal(l.consommer('ip', t + 2).autorise, true);

  const refus = l.consommer('ip', t + 3);
  assert.equal(refus.autorise, false);
  assert.ok(refus.resteSecondes > 0);
});

test('la fenêtre glisse : les jetons se libèrent', () => {
  const l = new Limiteur(2, 1000);
  const t = 5000;
  l.consommer('ip', t);
  l.consommer('ip', t + 10);
  assert.equal(l.consommer('ip', t + 20).autorise, false);
  assert.equal(l.consommer('ip', t + 1500).autorise, true);
});

test('les adresses sont comptées séparément', () => {
  const l = new Limiteur(1, 60000);
  assert.equal(l.consommer('a', 1).autorise, true);
  assert.equal(l.consommer('b', 1).autorise, true);
  assert.equal(l.consommer('a', 2).autorise, false);
});

test('nettoyer purge les clés expirées', () => {
  const l = new Limiteur(5, 1000);
  l.consommer('a', 1000);
  l.consommer('b', 1000);
  assert.equal(l.taille, 2);
  l.nettoyer(3000);
  assert.equal(l.taille, 0);
});

test('X-Forwarded-For n\'est lu que derrière un proxy de confiance', () => {
  const requete = {
    headers: { 'x-forwarded-for': '41.66.1.1, 10.0.0.5' },
    socket: { remoteAddress: '10.0.0.5' }
  };
  assert.equal(adresseClient(requete, true), '41.66.1.1');
  assert.equal(adresseClient(requete, false), '10.0.0.5');
});
