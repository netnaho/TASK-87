import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, maskPhone } from '../backend/src/lib/encryption';

describe('Encryption', () => {
  it('should encrypt and decrypt strings correctly', () => {
    const plaintext = 'sensitive-phone-number-555-1234';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same input (random IV)', () => {
    const plaintext = 'same-input';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);

    expect(enc1).not.toBe(enc2);

    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it('should throw on invalid ciphertext format', () => {
    expect(() => decrypt('invalid')).toThrow();
    expect(() => decrypt('a:b')).toThrow();
  });
});

describe('Phone Masking', () => {
  it('should mask phone numbers correctly', () => {
    expect(maskPhone('5551234567')).toBe('***-***-4567');
    expect(maskPhone('1234567890')).toBe('***-***-7890');
  });

  it('should handle short numbers', () => {
    expect(maskPhone('1234')).toBe('****');
    expect(maskPhone('12')).toBe('****');
  });
});
