import crypto from 'node:crypto';

/**
 * Encrypts a user's API key with AES-256-GCM.
 * Output (base64) = iv (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export function encryptUserKey(plainKey: string, masterKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypts a payload produced by encryptUserKey.
 * Throws if the payload was tampered with (GCM auth failure).
 */
export function decryptUserKey(
  payloadBase64: string,
  masterKey: Buffer,
): string {
  const data = Buffer.from(payloadBase64, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
