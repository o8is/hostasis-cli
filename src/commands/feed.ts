import { Command, Option } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFeedUpdate, normalizeProjectSlug, deriveProjectKey } from '@hostasis/swarm-stamper';
import { Binary } from 'cafe-utility';
import { fetchBatchDepth, fetchNextFeedIndex } from '../utils/swarm.js';
import { hexToBytes, getAddressFromPrivateKey } from '../utils/crypto.js';
import { DEFAULT_GATEWAY_URL } from '../utils/urls.js';


interface FeedUpdateOptions {
  reference: string;
  key: string;
  gateway?: string;
  index?: number;
  topic?: string;
  project?: string;
  quiet?: boolean;
}

/**
 * Public API for updating a feed (can be called from other commands)
 */
export async function updateFeed(options: {
  reference: string;
  vaultKey: string;
  batchId: string;
  gateway?: string;
  index?: number;
  depth?: number;
  topic?: string;
  project?: string;
}): Promise<void> {
  const topic = options.topic ? hexToBytes(options.topic) : new Uint8Array(32);
  const index = options.index ?? 0;
  const depth = options.depth ?? 20;
  const gateway = options.gateway || 'https://bzz.sh';

  // Derive project key if project is specified
  let signerPrivateKey: string | undefined;
  if (options.project) {
    const projectSlug = normalizeProjectSlug(options.project);
    const projectKey = deriveProjectKey(options.vaultKey, projectSlug);
    signerPrivateKey = projectKey.privateKey;
  }

  await writeFeedUpdate({
    vaultPrivateKey: options.vaultKey,
    signerPrivateKey,
    contentReference: options.reference,
    feedIndex: index,
    batchId: options.batchId,
    depth,
    gatewayUrl: gateway,
    topic
  });
}

export function createFeedCommand(): Command {
  const command = new Command('feed');

  command
    .description('Manage Swarm feeds');

  // Feed update subcommand
  const updateCommand = new Command('update')
    .description('Update a feed to point to new content')
    .requiredOption('--reference <hash>', 'Content reference (Swarm hash)')
    .addOption(
      new Option('--key <key>', 'Reserve private key for stamping (hex)')
        .env('HOSTASIS_PRIVATE_KEY')
        .makeOptionMandatory()
    )
    .addOption(
      new Option('--project <name>', 'Project name (derives feed signing key from vault key)')
        .env('HOSTASIS_PROJECT')
    )
    .option('--gateway <url>', 'Swarm gateway URL', DEFAULT_GATEWAY_URL)
    .option('--index <number>', 'Feed index (auto-fetches next index if not specified)')
    .option('--topic <hex>', 'Feed topic (hex string, defaults to NULL_TOPIC)')
    .addOption(
      new Option('--batch-id <id>', 'Postage batch ID')
        .env('HOSTASIS_BATCH_ID')
    )
    .option('--depth <number>', 'Batch depth (auto-fetched from batch if not specified)')
    .option('--quiet', 'Suppress progress output', false)
    .action(async (options: FeedUpdateOptions & { batchId?: string; depth?: string }) => {
      const spinner = options.quiet ? null : ora('Updating feed...').start();

      try {
        // Validate inputs
        if (!options.reference.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
          throw new Error('Invalid reference format (expected 64 hex characters)');
        }

        if (!options.key.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
          throw new Error('Invalid key format (expected 64 hex characters)');
        }

        if (!options.batchId) {
          throw new Error('--batch-id is required for feed updates');
        }

        const topic = options.topic ? hexToBytes(options.topic) : new Uint8Array(32);

        // Derive project key if project is specified
        let signerPrivateKey: string | undefined;
        let feedOwnerKey = options.key; // Key used for feed owner/signing
        if (options.project) {
          const projectSlug = normalizeProjectSlug(options.project);
          const projectKey = deriveProjectKey(options.key, projectSlug);
          signerPrivateKey = projectKey.privateKey;
          feedOwnerKey = signerPrivateKey;
          if (!options.quiet && spinner) {
            spinner.succeed(chalk.cyan(`Using project: ${projectSlug}`));
            spinner.start('Preparing feed update...');
          }
        }

        // Fetch batch depth if not provided
        let depth: number;
        if (options.depth) {
          depth = parseInt(options.depth);
        } else {
          if (!options.quiet && spinner) {
            spinner.text = 'Fetching batch depth...';
          }
          const fetchedDepth = await fetchBatchDepth(
            options.batchId,
            options.gateway || DEFAULT_GATEWAY_URL
          );
          if (fetchedDepth !== null) {
            depth = fetchedDepth;
            if (!options.quiet && spinner) {
              spinner.succeed(`Using batch depth: ${depth}`);
              spinner.start('Preparing feed update...');
            }
          } else {
            depth = 20; // Fallback to default
            if (!options.quiet && spinner) {
              spinner.warn('Could not fetch batch depth, using default: 20');
              spinner.start('Preparing feed update...');
            }
          }
        }

        // Fetch next feed index if not provided (use feed owner key)
        let index: number;
        if (options.index) {
          index = parseInt(options.index.toString());
        } else {
          if (!options.quiet && spinner) {
            spinner.text = 'Fetching next feed index...';
          }
          const fetchedIndex = await fetchNextFeedIndex(
            feedOwnerKey,
            options.gateway || DEFAULT_GATEWAY_URL,
            topic
          );
          if (fetchedIndex !== null) {
            index = fetchedIndex;
            if (!options.quiet && spinner) {
              spinner.succeed(`Using feed index: ${index}`);
            }
          } else {
            index = 0; // Fallback to 0 for new feeds
            if (!options.quiet && spinner) {
              spinner.warn('Could not fetch feed index, using default: 0');
            }
          }
        }

        if (!options.quiet) {
          spinner?.text && (spinner.text = `Writing feed update at index ${index}...`);
        }

        await writeFeedUpdate({
          vaultPrivateKey: options.key,
          signerPrivateKey,
          contentReference: options.reference,
          feedIndex: index,
          batchId: options.batchId,
          depth,
          gatewayUrl: options.gateway || DEFAULT_GATEWAY_URL,
          topic
        });

        if (options.quiet) {
          console.log('success');
        } else {
          spinner?.succeed(chalk.green('Feed updated successfully'));

          console.log('\n' + chalk.bold.green('✓ Feed update complete!\n'));
          console.log(chalk.gray('Index:     '), chalk.white(index));
          console.log(chalk.gray('Reference: '), chalk.white(options.reference));

          // Calculate feed address for display (use feed owner key)
          const owner = getAddressFromPrivateKey(feedOwnerKey);
          console.log(chalk.gray('Owner:     '), chalk.white('0x' + Binary.uint8ArrayToHex(owner)));
          if (options.project) {
            console.log(chalk.gray('Project:   '), chalk.white(options.project));
          }
        }
      } catch (error) {
        if (spinner) {
          spinner.fail(chalk.red('Feed update failed'));
        }
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  command.addCommand(updateCommand);

  return command;
}
