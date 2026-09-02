const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
/** 12-character base32 id from crypto randomness. */
export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % 32]!).join('');
}
