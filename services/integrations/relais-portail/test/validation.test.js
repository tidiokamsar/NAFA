'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const v = require('../src/validation');

const DEPOT = {
  extensions: ['pdf', 'docx', 'jpg', 'jpeg', 'png'],
  tailleMaxFichierOctets: 10 * 1024 * 1024,
  tailleMaxTotalOctets: 30 * 1024 * 1024,
  nombreMaxPieces: 10
};

function base64DeTaille(octets) {
  return Buffer.alloc(octets, 0x41).toString('base64');
}

function candidature(modifications = {}) {
  return Object.assign({
    offreRef: 'RH/2026/012',
    nom: 'Camara',
    prenom: 'Aïssatou',
    courriel: 'aissatou.camara@example.gn',
    telephone: '+224 622 00 00 00',
    consentement: true,
    pieces: [{ nom: 'CV.pdf', contenuBase64: base64DeTaille(2048) }]
  }, modifications);
}

test('tailleBase64 renvoie la taille décodée exacte', () => {
  assert.equal(v.tailleBase64(Buffer.from('abc').toString('base64')), 3);
  assert.equal(v.tailleBase64(Buffer.from('ab').toString('base64')), 2);
  assert.equal(v.tailleBase64(Buffer.from('a').toString('base64')), 1);
  assert.equal(v.tailleBase64(base64DeTaille(1048576)), 1048576);
});

test('tailleBase64 rejette les contenus non base64', () => {
  assert.equal(v.tailleBase64('pas du base64 !'), null);
  assert.equal(v.tailleBase64('QUJD='), null); // longueur non multiple de 4
  assert.equal(v.tailleBase64(''), null);
  assert.equal(v.tailleBase64(null), null);
});

test('nettoyerNomFichier neutralise les traversées de chemin', () => {
  assert.equal(v.nettoyerNomFichier('../../etc/passwd'), 'passwd');
  assert.equal(v.nettoyerNomFichier('C:\\Users\\HP\\CV.pdf'), 'CV.pdf');
  assert.equal(v.nettoyerNomFichier('.htaccess'), 'htaccess');
  assert.equal(v.nettoyerNomFichier('Lettre <motivation>.pdf'), 'Lettre motivation.pdf');
});

test('nettoyer supprime les caractères de contrôle (injection d\'en-tête)', () => {
  const avec = 'Camara\r\nBcc: cible@example.com';
  assert.equal(v.nettoyer(avec, 80).includes('\n'), false);
  assert.equal(v.nettoyer(avec, 80).includes('\r'), false);
});

test('candidature conforme acceptée et charge utile normalisée', () => {
  const r = v.validerCandidature(candidature(), DEPOT);
  assert.equal(r.valide, true);
  assert.equal(r.donnees.offreRef, 'RH/2026/012');
  assert.equal(r.donnees.courriel, 'aissatou.camara@example.gn');
  assert.equal(r.donnees.consentement, true);
  assert.equal(r.donnees.pieces.length, 1);
  /* Le jeton CAPTCHA ne doit jamais être relayé au flux. */
  assert.equal('captcha' in r.donnees, false);
});

test('EXG-23 — le consentement absent ou faux est refusé', () => {
  for (const valeur of [false, undefined, 'oui', 1]) {
    const r = v.validerCandidature(candidature({ consentement: valeur }), DEPOT);
    assert.equal(r.valide, false);
    assert.equal(r.code, 400);
    assert.equal(r.exigence, 'EXG-23');
  }
});

test('EXG-22 — extension interdite refusée', () => {
  const r = v.validerCandidature(
    candidature({ pieces: [{ nom: 'virus.exe', contenuBase64: base64DeTaille(64) }] }), DEPOT);
  assert.equal(r.valide, false);
  assert.equal(r.exigence, 'EXG-22');
  assert.match(r.message, /Format refusé/);
});

test('EXG-22 — fichier de plus de 10 Mo refusé', () => {
  const r = v.validerCandidature(
    candidature({ pieces: [{ nom: 'CV.pdf', contenuBase64: base64DeTaille(11 * 1024 * 1024) }] }),
    DEPOT);
  assert.equal(r.valide, false);
  assert.match(r.message, /10 Mo/);
});

test('EXG-22 — total de plus de 30 Mo refusé', () => {
  const piece = (n) => ({ nom: `piece${n}.pdf`, contenuBase64: base64DeTaille(9 * 1024 * 1024) });
  const r = v.validerCandidature(
    candidature({ pieces: [piece(1), piece(2), piece(3), piece(4)] }), DEPOT);
  assert.equal(r.valide, false);
  assert.match(r.message, /totale/);
});

test('EXG-22 — dossier sans pièce refusé', () => {
  assert.equal(v.validerCandidature(candidature({ pieces: [] }), DEPOT).valide, false);
  assert.equal(v.validerCandidature(candidature({ pieces: null }), DEPOT).valide, false);
});

test('références et adresses invalides refusées', () => {
  assert.equal(v.validerCandidature(candidature({ offreRef: 'n\'importe quoi' }), DEPOT).valide, false);
  assert.equal(v.validerCandidature(candidature({ courriel: 'pas-une-adresse' }), DEPOT).valide, false);
  assert.equal(v.validerCandidature(candidature({ nom: '   ' }), DEPOT).valide, false);
});

test('EXG-26 — recevabilité de l\'offre', () => {
  const maintenant = new Date('2026-07-29T10:00:00Z');
  const ouverte = { statut: 'Publié', cloture: '2026-08-15T17:00' };
  const cloturee = { statut: 'Clôturé', cloture: '2026-08-15T17:00' };
  const depassee = { statut: 'Publié', cloture: '2026-07-01T17:00' };

  assert.equal(v.verifierRecevabilite(ouverte, maintenant).valide, true);

  const r1 = v.verifierRecevabilite(cloturee, maintenant);
  assert.equal(r1.valide, false);
  assert.equal(r1.code, 409);
  assert.equal(r1.exigence, 'EXG-26');

  const r2 = v.verifierRecevabilite(depassee, maintenant);
  assert.equal(r2.valide, false);
  assert.equal(r2.code, 409);

  assert.equal(v.verifierRecevabilite(null, maintenant).code, 404);
});

test('abonnement — consentement et thème', () => {
  const ok = v.validerAbonnement({ courriel: 'A@Example.GN', consentement: true, theme: 'AO' });
  assert.equal(ok.valide, true);
  assert.equal(ok.donnees.courriel, 'a@example.gn');
  assert.equal(ok.donnees.theme, 'AO');

  const defaut = v.validerAbonnement({ courriel: 'a@example.gn', consentement: true, theme: 'pirate' });
  assert.equal(defaut.donnees.theme, 'Les deux');

  const refus = v.validerAbonnement({ courriel: 'a@example.gn', consentement: false });
  assert.equal(refus.valide, false);
  assert.equal(refus.exigence, 'EXG-32');
});

test('jeton de confirmation — format contrôlé', () => {
  const guid = '2f1c9a6e-1b3d-4f8a-9c2e-77a1b5d6e0f3';
  assert.equal(v.validerJeton({ jeton: guid }).valide, true);
  assert.equal(v.validerJeton({ jeton: 'court' }).valide, false);
  assert.equal(v.validerJeton({ jeton: '../../admin' }).valide, false);
});
