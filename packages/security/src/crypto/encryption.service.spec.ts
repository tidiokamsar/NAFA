import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const key = EncryptionService.generateKey();
  const service = new EncryptionService(key);

  it('round-trips a value', () => {
    const plaintext = 'nafa-secret-value';
    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it('round-trips unicode and empty strings', () => {
    expect(service.decrypt(service.encrypt('Conakry — Guinée 🇬🇳'))).toBe(
      'Conakry — Guinée 🇬🇳',
    );
    expect(service.decrypt(service.encrypt(''))).toBe('');
  });

  // A fresh IV per call is what keeps GCM safe; identical ciphertexts would
  // mean the IV is being reused.
  it('produces a different ciphertext each time', () => {
    const a = service.encrypt('same input');
    const b = service.encrypt('same input');
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe(service.decrypt(b));
  });

  it('rejects a tampered ciphertext', () => {
    const encrypted = service.encrypt('sensitive');
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a bit in the ciphertext
    expect(() => service.decrypt(raw.toString('base64'))).toThrow();
  });

  it('rejects a ciphertext produced with another key', () => {
    const other = new EncryptionService(EncryptionService.generateKey());
    expect(() => other.decrypt(service.encrypt('secret'))).toThrow();
  });

  it('rejects a payload too short to hold iv and tag', () => {
    expect(() =>
      service.decrypt(Buffer.from('short').toString('base64')),
    ).toThrow(/too short/i);
  });

  it('rejects a key of the wrong length', () => {
    expect(
      () => new EncryptionService(Buffer.alloc(16).toString('base64')),
    ).toThrow(/32 bytes/);
  });

  it('accepts a hex-encoded key', () => {
    const hexKey = Buffer.from(key, 'base64').toString('hex');
    const fromHex = new EncryptionService(hexKey);
    expect(fromHex.decrypt(service.encrypt('interop'))).toBe('interop');
  });

  describe('safeEquals', () => {
    it('compares equal strings', () => {
      expect(EncryptionService.safeEquals('token', 'token')).toBe(true);
    });

    it('rejects different strings', () => {
      expect(EncryptionService.safeEquals('token', 'other')).toBe(false);
    });

    it('rejects strings of different length without throwing', () => {
      expect(EncryptionService.safeEquals('short', 'much-longer')).toBe(false);
    });
  });
});
