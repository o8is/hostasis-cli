import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const hexWithoutPrefix = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(hexWithoutPrefix.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexWithoutPrefix.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get Ethereum address from private key
 */
export function getAddressFromPrivateKey(privateKeyHex: string): Uint8Array {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKey = secp256k1.getPublicKey(privateKeyBytes, false);
  const publicKeyHash = keccak_256(publicKey.slice(1));
  return publicKeyHash.slice(-20);
}
