'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { creerServeur } = require('../src/serveur');

const SILENCE = { info() {}, warn() {}, error() {} };

function configDeTest(modifications = {}) {
  return Object.assign({
    port: 0,
    racineStatique: '',
    flux: {
      candidatures: 'https://flux.exemple/wf05',
      abonnement: 'https://flux.exemple/wf08a',
      confirmation: 'https://flux.exemple/wf08b',
      desabonnement: 'https://flux.exemple/wf08c'
    },
    clePartagee: 'cle-de-recette',
    entetesCle: 'x-cle-relais',
    delaiFluxMs: 5000,
    captcha: { fournisseur: 'aucun', secret: '', delaiMs: 5000 },
    catalogue: { source: '', dureeCacheMs: 1000, obligatoire: false },
    depot: {
      extensions: ['pdf', 'docx', 'jpg', 'jpeg', 'png'],
      tailleMaxFichierOctets: 10 * 1024 * 1024,
      tailleMaxTotalOctets: 30 * 1024 * 1024,
      nombreMaxPieces: 10
    },
    limites: { candidaturesParHeure: 5, abonnementsParHeure: 10, requetesParMinute: 30 },
    proxyDeConfiance: false,
    originesAutorisees: [],
    tailleMaxCorpsOctets: 48 * 1024 * 1024,
    journalDetaille: false
  }, modifications);
}

/* Catalogue simulé : une offre ouverte, une clôturée. */
function catalogueDeTest(disponible = true) {
  const offres = {
    'RH/2026/012': { statut: 'Publié', cloture: '2099-01-01T17:00' },
    'RH/2026/009': { statut: 'Clôturé', cloture: '2020-01-01T17:00' },
    'RH/2026/099': { statut: 'Publié', cloture: '2020-01-01T17:00' }
  };
  return {
    configure: true,
    async trouverOffre(reference) {
      if (!disponible) return { disponible: false, offre: null };
      return { disponible: true, offre: offres[reference] || null };
    }
  };
}

function fauxFetch(reponses = {}) {
  const appels = [];
  const fn = async (url, options) => {
    appels.push({ url: String(url), options });
    const fabrique = reponses[String(url)];
    if (typeof fabrique === 'function') return fabrique(options);
    return new Response(JSON.stringify({ dossier: 'CAND-2026-12345' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  fn.appels = appels;
  return fn;
}

async function avecServeur(config, dependances, scenario) {
  const serveur = creerServeur(config, Object.assign({ journal: SILENCE }, dependances));
  await new Promise((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    await scenario(base);
  } finally {
    await new Promise((resolve) => serveur.close(resolve));
  }
}

function poster(base, chemin, corps) {
  return fetch(base + chemin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof corps === 'string' ? corps : JSON.stringify(corps)
  });
}

function candidature(modifications = {}) {
  return Object.assign({
    offreRef: 'RH/2026/012',
    nom: 'Camara',
    prenom: 'Aïssatou',
    courriel: 'aissatou@example.gn',
    telephone: '+224 622 00 00 00',
    consentement: true,
    captcha: 'jeton-widget',
    pieces: [{ nom: 'CV.pdf', contenuBase64: Buffer.alloc(2048, 0x41).toString('base64') }]
  }, modifications);
}

/* --------------------------------------------------------------- */

test('dépôt conforme : 200, numéro de dossier et charge utile épurée', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures', candidature());
    assert.equal(reponse.status, 200);
    assert.deepEqual(await reponse.json(), { dossier: 'CAND-2026-12345' });

    assert.equal(appel.appels.length, 1);
    const envoi = appel.appels[0];
    assert.equal(envoi.url, 'https://flux.exemple/wf05');
    assert.equal(envoi.options.headers['x-cle-relais'], 'cle-de-recette');

    const charge = JSON.parse(envoi.options.body);
    assert.equal(charge.offreRef, 'RH/2026/012');
    assert.equal(charge.consentement, true);
    /* Le jeton CAPTCHA reste au relais (CDC §7.3). */
    assert.equal('captcha' in charge, false);
  });
});

test('EXG-26 : dépôt sur une offre clôturée refusé sans appeler le flux', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures',
      candidature({ offreRef: 'RH/2026/009' }));
    assert.equal(reponse.status, 409);
    assert.match((await reponse.json()).message, /clôturée/);
    assert.equal(appel.appels.length, 0);
  });
});

test('EXG-26 : date limite dépassée refusée même si le statut est « Publié »', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures',
      candidature({ offreRef: 'RH/2026/099' }));
    assert.equal(reponse.status, 409);
    assert.equal(appel.appels.length, 0);
  });
});

test('offre inconnue du catalogue : 404', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures',
      candidature({ offreRef: 'RH/2026/777' }));
    assert.equal(reponse.status, 404);
    assert.equal(appel.appels.length, 0);
  });
});

test('EXG-22 : pièce au format interdit refusée', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures', candidature({
      pieces: [{ nom: 'malveillant.exe', contenuBase64: Buffer.alloc(64).toString('base64') }]
    }));
    assert.equal(reponse.status, 400);
    assert.equal((await reponse.json()).exigence, 'EXG-22');
    assert.equal(appel.appels.length, 0);
  });
});

test('catalogue injoignable : dépôt relayé si CATALOGUE_OBLIGATOIRE=false', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest(false) },
    async (base) => {
      const reponse = await poster(base, '/api/candidatures', candidature());
      assert.equal(reponse.status, 200);
      assert.equal(appel.appels.length, 1);
    });
});

test('catalogue injoignable : dépôt bloqué si CATALOGUE_OBLIGATOIRE=true', async () => {
  const appel = fauxFetch();
  const config = configDeTest();
  config.catalogue.obligatoire = true;
  await avecServeur(config, { fetch: appel, catalogue: catalogueDeTest(false) }, async (base) => {
    const reponse = await poster(base, '/api/candidatures', candidature());
    assert.equal(reponse.status, 503);
    assert.equal(appel.appels.length, 0);
  });
});

test('CAPTCHA refusé : 403 et aucun appel au flux', async () => {
  const appel = fauxFetch({
    'https://challenges.cloudflare.com/turnstile/v0/siteverify': () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
        { status: 200 })
  });
  const config = configDeTest();
  config.captcha = { fournisseur: 'turnstile', secret: 'secret', delaiMs: 5000 };

  await avecServeur(config, { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures', candidature());
    assert.equal(reponse.status, 403);
    assert.equal(appel.appels.length, 1); // uniquement la vérification CAPTCHA
    assert.match(appel.appels[0].url, /siteverify/);
  });
});

test('limitation de débit : au-delà du quota, 429 avec Retry-After', async () => {
  const appel = fauxFetch();
  const config = configDeTest();
  config.limites.candidaturesParHeure = 2;

  await avecServeur(config, { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    assert.equal((await poster(base, '/api/candidatures', candidature())).status, 200);
    assert.equal((await poster(base, '/api/candidatures', candidature())).status, 200);
    const troisieme = await poster(base, '/api/candidatures', candidature());
    assert.equal(troisieme.status, 429);
    assert.ok(Number(troisieme.headers.get('retry-after')) > 0);
    assert.equal(appel.appels.length, 2);
  });
});

test('un refus métier du flux est transmis tel quel au candidat', async () => {
  const appel = fauxFetch({
    'https://flux.exemple/wf05': () =>
      new Response(JSON.stringify({ message: 'Offre clôturée.' }), { status: 409 })
  });
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures', candidature());
    assert.equal(reponse.status, 409);
    assert.equal((await reponse.json()).message, 'Offre clôturée.');
  });
});

test('une erreur interne du flux est masquée derrière un 502', async () => {
  const appel = fauxFetch({
    'https://flux.exemple/wf05': () =>
      new Response('Trace interne Power Automate', { status: 500 })
  });
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures', candidature());
    assert.equal(reponse.status, 502);
    const corps = await reponse.json();
    assert.equal(corps.message.includes('Trace interne'), false);
  });
});

test('abonnement : 202 et charge utile conforme à WF-08', async () => {
  const appel = fauxFetch();
  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/abonnements', {
      courriel: 'Abonne@Example.GN', theme: 'AO', consentement: true, captcha: 'x'
    });
    assert.equal(reponse.status, 202);
    const charge = JSON.parse(appel.appels[0].options.body);
    assert.deepEqual(charge, { courriel: 'abonne@example.gn', theme: 'AO', consentement: true });
  });
});

test('confirmation et désabonnement relaient le jeton', async () => {
  const appel = fauxFetch({
    'https://flux.exemple/wf08b': () => new Response('{}', { status: 200 }),
    'https://flux.exemple/wf08c': () => new Response('{}', { status: 200 })
  });
  const guid = '2f1c9a6e-1b3d-4f8a-9c2e-77a1b5d6e0f3';

  await avecServeur(configDeTest(), { fetch: appel, catalogue: catalogueDeTest() }, async (base) => {
    assert.equal((await poster(base, '/api/abonnements/confirmer', { jeton: guid })).status, 200);
    assert.equal((await poster(base, '/api/abonnements/desabonnement', { jeton: guid })).status, 200);
    assert.equal((await poster(base, '/api/abonnements/confirmer', { jeton: 'x' })).status, 400);
    assert.equal(appel.appels.length, 2);
  });
});

test('service non configuré : 503 plutôt qu\'une erreur interne', async () => {
  const config = configDeTest();
  config.flux.abonnement = '';
  await avecServeur(config, { fetch: fauxFetch(), catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/abonnements',
      { courriel: 'a@example.gn', consentement: true });
    assert.equal(reponse.status, 503);
  });
});

test('en-têtes de sécurité et sonde de santé', async () => {
  await avecServeur(configDeTest(), { fetch: fauxFetch(), catalogue: catalogueDeTest() },
    async (base) => {
      const reponse = await fetch(base + '/api/sante');
      assert.equal(reponse.status, 200);
      assert.equal((await reponse.json()).etat, 'ok');
      assert.equal(reponse.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(reponse.headers.get('x-frame-options'), 'DENY');
      assert.match(reponse.headers.get('referrer-policy'), /strict-origin/);
    });
});

test('route inconnue et JSON invalide', async () => {
  await avecServeur(configDeTest(), { fetch: fauxFetch(), catalogue: catalogueDeTest() },
    async (base) => {
      assert.equal((await poster(base, '/api/inconnu', {})).status, 404);
      assert.equal((await poster(base, '/api/candidatures', '{ pas du json')).status, 400);
    });
});

test('corps au-delà du plafond : 413', async () => {
  const config = configDeTest();
  config.tailleMaxCorpsOctets = 1024;
  await avecServeur(config, { fetch: fauxFetch(), catalogue: catalogueDeTest() }, async (base) => {
    const reponse = await poster(base, '/api/candidatures',
      candidature({ pieces: [{ nom: 'CV.pdf', contenuBase64: Buffer.alloc(4096).toString('base64') }] }))
      .catch((erreur) => erreur);
    /* Le serveur coupe la connexion : soit un 413 est reçu, soit
       fetch remonte l'interruption. Les deux sont acceptables. */
    if (reponse instanceof Error) {
      assert.match(reponse.message, /fetch failed|terminated|socket/i);
    } else {
      assert.equal(reponse.status, 413);
    }
  });
});
