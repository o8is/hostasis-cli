import axios from 'axios';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { createPublicClient, http } from 'viem';
import { gnosis } from 'viem/chains';

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
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
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get Ethereum address from private key
 */
function getAddressFromPrivateKey(privateKeyHex: string): Uint8Array {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKey = secp256k1.getPublicKey(privateKeyBytes, false);
  const publicKeyHash = keccak_256(publicKey.slice(1));
  return publicKeyHash.slice(-20);
}

// PostageStamp contract on Gnosis Chain
const POSTAGE_STAMP_ADDRESS = '0x45a1502382541Cd610CC9068e88727426b696293' as const;
const BATCH_DEPTH_ABI = [{
  name: 'batchDepth',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'batchId', type: 'bytes32' }],
  outputs: [{ name: '', type: 'uint8' }]
}] as const;

/**
 * Fetch batch depth from PostageStamp contract on Gnosis Chain
 */
export async function fetchBatchDepth(
  batchId: string,
  rpcUrl: string = 'https://rpc.gnosis.gateway.fm'
): Promise<number | null> {
  try {
    // Ensure batchId has 0x prefix for blockchain calls
    const prefixedBatchId = batchId.startsWith('0x') ? batchId as `0x${string}` : `0x${batchId}` as `0x${string}`;

    // Create Gnosis Chain client with custom RPC URL
    const client = createPublicClient({
      chain: gnosis,
      transport: http(rpcUrl)
    });

    // Call batchDepth on PostageStamp contract
    const depth = await client.readContract({
      address: POSTAGE_STAMP_ADDRESS,
      abi: BATCH_DEPTH_ABI,
      functionName: 'batchDepth',
      args: [prefixedBatchId]
    });

    return Number(depth);
  } catch (error) {
    // Batch doesn't exist or RPC error
    return null;
  }
}

/**
 * Fetch the next feed index for a given owner/topic
 */
export async function fetchNextFeedIndex(
  vaultPrivateKey: string,
  gatewayUrl: string,
  topic: Uint8Array = new Uint8Array(32)
): Promise<number | null> {
  try {
    const owner = getAddressFromPrivateKey(vaultPrivateKey);
    const ownerHex = bytesToHex(owner);
    const topicHex = bytesToHex(topic);

    const response = await axios.get(
      `${gatewayUrl}/feeds/${ownerHex}/${topicHex}`,
      {
        timeout: 5000,
        validateStatus: (status) => status === 200 || status === 404
      }
    );

    // If feed doesn't exist yet (404), start at index 0
    if (response.status === 404) {
      return 0;
    }

    // Try to get feedIndexNext from headers or body
    const feedIndexNext = response.headers['swarm-feed-index-next'] ||
                          response.data?.feedIndexNext;

    if (feedIndexNext !== undefined) {
      // feedIndexNext is returned as hex string
      if (typeof feedIndexNext === 'string') {
        return parseInt(feedIndexNext, 16);
      }
      return feedIndexNext;
    }

    // If we have feedIndex but not feedIndexNext, increment it
    const feedIndex = response.headers['swarm-feed-index'] ||
                      response.data?.feedIndex;

    if (feedIndex !== undefined) {
      if (typeof feedIndex === 'string') {
        return parseInt(feedIndex, 16) + 1;
      }
      return feedIndex + 1;
    }

    return null;
  } catch (error) {
    // Feed doesn't exist or gateway doesn't support this endpoint
    return null;
  }
}
