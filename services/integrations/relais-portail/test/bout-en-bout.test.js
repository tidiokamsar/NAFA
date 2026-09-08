'use strict';

/* Test de bout en bout : le vrai point d'entrée (src/index.js) est
   démarré avec sa configuration d'environnement, devant un faux
   déclencheur Power Automate, et sert le vrai front public.

   C'est le seul test qui exerce la configuration, le démarrage, le
   service des fichiers statiques et le parcours de candidature
   complet dans un même processus. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: attendre } = require('node:timers/promises');

const RACINE_SERVICE = path.join(__dirname, '..');
const FRONT = path.join(RACINE_SERVICE, '..', '..', '..',
  'apps', 'web', 'portail-opportunites', 'public');

/* Le jeu d'exemple sert de catalogue : RH/2026/012 y est ouverte
   jusqu'en 2099 (voir remplacerDates), RH/2026/009 est clôturée. */
function preparerCatalogue(dossier) {
  const exemple = JSON.parse(
    fs.readFileSync(path.join(FRONT, 'data', 'opportunites.exemple.json'), 'utf8'));
  exemple.recrutements = exemple.recrutements.map((o) =>
    o.ref === 'RH/2026/012' ? Object.assign({}, o, { cloture: '2099-08-15T17:00' }) : o);
  const cible = path.join(dossier, 'catalogue.json');
  fs.writeFileSync(cible, JSON.stringify(exemple));
  return cible;
}

function fauxFlux(recus) {
  const serveur = http.createServer((rq, rp) => {
    let corps = '';
    rq.on('data', (m) => (corps += m));
    rq.on('end', () => {
      let charge = {};
      try { charge = JSON.parse(corps || '{}'); } catch (e) { /* corps illisible */ }
      recus.push({ url: rq.url, cle: rq.headers['x-cle-relais'], charge });
      rp.writeHead(200, { 'Content-Type': 'application/json' });
      rp.end(JSON.stringify({ dossier: 'CAND-2026-40404' }));
    });
  });
  return serveur;
}

async function attendreServeur(base, essais = 40) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(base + '/api/sante');
      if (r.ok) return true;
    } catch (e) { /* pas encore à l'écoute */ }
    await attendre(150);
  }
  return false;
}

test('parcours complet : front servi et candidature relayée', async (t) => {
  if (!fs.existsSync(FRONT)) {
    t.skip('front public absent de l\'arborescence');
    return;
  }

  const temporaire = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'relais-'));
  const catalogue = preparerCatalogue(temporaire);
  const recus = [];
  const flux = fauxFlux(recus);
  await new Promise((r) => flux.listen(0, '127.0.0.1', r));
  const portFlux = flux.address().port;

  const relais = spawn(process.execPath, [path.join(RACINE_SERVICE, 'src', 'index.js')], {
    env: Object.assign({}, process.env, {
      PORT: '0',
      URL_FLUX_CANDIDATURES: `http://127.0.0.1:${portFlux}/wf05`,
      URL_FLUX_ABONNEMENT: `http://127.0.0.1:${portFlux}/wf08a`,
      CLE_PARTAGEE: 'cle-de-test',
      CAPTCHA_FOURNISSEUR: 'aucun',
      // Le relais refuse désormais de démarrer sans CAPTCHA tant que
      // personne ne l'assume. Un test de bout en bout est précisément
      // le cas où on l'assume.
      AUTORISER_SANS_CAPTCHA: 'true',
      SOURCE_CATALOGUE: catalogue,
      RACINE_STATIQUE: FRONT
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  /* Le port 0 laisse le noyau choisir : on le lit sur la sortie. */
  let port = null;
  relais.stdout.on('data', (d) => {
    const m = String(d).match(/port (\d+)/);
    if (m) port = m[1];
  });

  try {
    for (let i = 0; i < 40 && !port; i++) await attendre(100);
    assert.ok(port, 'le relais doit annoncer son port');
    const base = `http://127.0.0.1:${port}`;
    assert.ok(await attendreServeur(base), 'le relais doit répondre sur /api/sante');

    /* 1. Le front est servi avec sa CSP, sans 'unsafe-inline'. */
    const accueil = await fetch(base + '/');
    assert.equal(accueil.status, 200);
    const csp = accueil.headers.get('content-security-policy');
    assert.ok(csp, 'la CSP doit être posée sur le HTML');
    assert.ok(!csp.includes('unsafe-inline'), 'la CSP ne doit pas autoriser unsafe-inline');
    for (const ressource of ['/assets/portail.js', '/assets/portail.css',
                             '/assets/config.js', '/confirmer.html', '/desabonnement.html']) {
      assert.equal((await fetch(base + ressource)).status, 200, ressource);
    }

    /* 2. Dépôt conforme sur une offre ouverte. */
    const piece = Buffer.from('%PDF-1.4 contenu de test').toString('base64');
    const depot = await fetch(base + '/api/candidatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offreRef: 'RH/2026/012', nom: 'Camara', prenom: 'Aissatou',
        courriel: 'a@example.gn', telephone: '+224 622 00 00 00',
        consentement: true, captcha: 'jeton',
        pieces: [{ nom: 'CV.pdf', contenuBase64: piece }]
      })
    });
    assert.equal(depot.status, 200);
    assert.equal((await depot.json()).dossier, 'CAND-2026-40404');
    assert.equal(recus.length, 1);
    assert.equal(recus[0].cle, 'cle-de-test');
    assert.equal('captcha' in recus[0].charge, false);

    /* 3. EXG-26 : offre clôturée refusée, sans appel au flux. */
    const refus = await fetch(base + '/api/candidatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offreRef: 'RH/2026/009', nom: 'X', prenom: 'Y', courriel: 'a@b.gn',
        consentement: true, pieces: [{ nom: 'CV.pdf', contenuBase64: piece }]
      })
    });
    assert.equal(refus.status, 409);
    assert.equal(recus.length, 1);

    /* 4. Abonnement accepté. */
    const abo = await fetch(base + '/api/abonnements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courriel: 'abonne@example.gn', theme: 'AO', consentement: true })
    });
    assert.equal(abo.status, 202);

    /* 5. Service non configuré : refus propre, pas d'erreur interne. */
    const confirmation = await fetch(base + '/api/abonnements/confirmer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: '2f1c9a6e-1b3d-4f8a-9c2e-77a1b5d6e0f3' })
    });
    assert.equal(confirmation.status, 503);
  } finally {
    relais.kill('SIGTERM');
    await new Promise((r) => flux.close(r));
    fs.rmSync(temporaire, { recursive: true, force: true });
  }
});
