import { Command, Option } from 'commander';
import { StampedUploader, normalizeProjectSlug, deriveProjectKey } from '@hostasis/swarm-stamper';
import chalk from 'chalk';
import ora from 'ora';
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { updateFeed } from './feed.js';
import { fetchBatchDepth, fetchNextFeedIndex } from '../utils/swarm.js';
import { getAddressFromPrivateKey } from '../utils/crypto.js';
import { Binary } from 'cafe-utility';
import { DEFAULT_GATEWAY_URL, DEFAULT_GNOSIS_RPC_URL } from '../utils/urls.js';

interface UploadOptions {
  batchId: string;
  key: string;
  gateway?: string;
  indexDocument?: string;
  spa?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  gnosisRpc?: string;
  project?: string;

  output?: 'json' | 'text';
  feed?: boolean;
  feedIndex?: string;
  depth?: string;
}

/**
 * Convert file paths to File objects for browser-compatible upload
 */
async function pathsToFiles(filePaths: string[], basePath: string): Promise<File[]> {
  const files: File[] = [];

  for (const filePath of filePaths) {
    const fullPath = path.resolve(filePath);
    const relativePath = path.relative(basePath, fullPath);
    const fileData = await fs.promises.readFile(fullPath);

    // Create a File-like object
    const file = new File([fileData], relativePath, {
      type: 'application/octet-stream'
    });

    // Add webkitRelativePath for proper path handling
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      writable: false
    });

    files.push(file);
  }

  return files;
}

export function createUploadCommand(): Command {
  const command = new Command('upload');

  command
    .description('Upload files to Swarm with client-side stamping')
    .argument('<path>', 'Path to file or directory to upload')
    .addOption(
      new Option('--batch-id <id>', 'Postage batch ID (hex)')
        .env('HOSTASIS_BATCH_ID')
        .makeOptionMandatory()
    )
    .addOption(
      new Option('--key <key>', 'Reserve private key for stamping (hex)')
        .env('HOSTASIS_PRIVATE_KEY')
        .makeOptionMandatory()
    )
    .addOption(
      new Option('--project <name>', 'Project name (derives feed signing key from reserve key)')
        .env('HOSTASIS_PROJECT')
    )
    .option('--gateway <url>', 'Swarm gateway URL', DEFAULT_GATEWAY_URL)
    .option('--index-document <file>', 'Index document for website', 'index.html')
    .option('--spa', 'Enable Single Page App mode (routes 404s to index)', false)
    .option('--feed', 'Update feed after upload', false)
    .option('--feed-index <number>', 'Feed index for update (auto-fetches next index if not specified)')
    .option('--verbose', 'Show detailed error and request information', false)

    .option('--gnosis-rpc <url>', 'Gnosis Chain RPC URL for batch depth lookup', DEFAULT_GNOSIS_RPC_URL)

    .option('--depth <number>', 'Batch depth (auto-fetched from batch if not specified)')
    .option('--quiet', 'Suppress progress output', false)
    .option('--output <format>', 'Output format: json or text', 'text')
    .action(async (uploadPath: string, options: UploadOptions) => {
      const spinner = options.quiet ? null : ora('Preparing upload...').start();

      try {
        // Validate inputs
        if (!options.batchId.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
          throw new Error('Invalid batch ID format (expected 64 hex characters)');
        }

        if (!options.key.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
          throw new Error('Invalid key format (expected 64 hex characters)');
        }

        // Resolve path
        const fullPath = path.resolve(uploadPath);
        const stats = await fs.promises.stat(fullPath);

        let files: File[];
        let basePath: string;

        if (stats.isDirectory()) {
          // Upload entire directory
          spinner?.text && (spinner.text = 'Scanning directory...');

          const pattern = path.join(fullPath, '**/*');
          const filePaths = await glob(pattern, {
            nodir: true,
            dot: true // Include hidden files
          });

          if (filePaths.length === 0) {
            throw new Error('No files found in directory');
          }

          if (!options.quiet) {
            spinner?.succeed(`Found ${filePaths.length} files`);
            spinner?.start('Preparing files...');
          }

          basePath = fullPath;
          files = await pathsToFiles(filePaths, basePath);
        } else {
          // Upload single file
          basePath = path.dirname(fullPath);
          files = await pathsToFiles([fullPath], basePath);
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
            options.gnosisRpc
          );
          if (fetchedDepth !== null) {
            depth = fetchedDepth;
            if (!options.quiet && spinner) {
              spinner.succeed(`Using batch depth: ${depth}`);
              spinner.start('Preparing upload...');
            }
          } else {
            depth = 20; // Fallback to default
            if (!options.quiet && spinner) {
              spinner.warn('Could not fetch batch depth, using default: 20');
              spinner.start('Preparing upload...');
            }
          }
        }

        // Create uploader
        const uploader = new StampedUploader({
          gatewayUrl: options.gateway || DEFAULT_GATEWAY_URL,
          batchId: options.batchId,
          privateKey: options.key,
          depth
        });

        if (!options.quiet) {
          spinner?.text && (spinner.text = 'Uploading to Swarm...');
        }

        // Upload with progress tracking
        const result = await uploader.uploadFiles(files, {
          indexDocument: options.indexDocument,
          isSPA: options.spa,
          onProgress: (progress) => {
            if (!options.quiet && spinner) {
              if (progress.phase === 'stamping') {
                spinner.text = chalk.cyan(progress.message);
              } else if (progress.phase === 'chunking') {
                spinner.text = chalk.yellow(progress.message);
              } else if (progress.phase === 'uploading') {
                const percentage = progress.percentage ? ` (${Math.round(progress.percentage)}%)` : '';
                spinner.text = chalk.blue(`${progress.message}${percentage}`);
              } else if (progress.phase === 'complete') {
                spinner.succeed(chalk.green(progress.message));
              } else if (progress.phase === 'error') {
                spinner.fail(chalk.red(progress.message));
              }
            }
          }
        });

        // Update feed if requested
        if (options.feed) {
          // Derive project key if project is specified
          let feedOwnerKey = options.key;
          if (options.project) {
            const projectSlug = normalizeProjectSlug(options.project);
            const projectKey = deriveProjectKey(options.key, projectSlug);
            feedOwnerKey = projectKey.privateKey;
            if (!options.quiet && spinner) {
              spinner.succeed(chalk.cyan(`Using project: ${projectSlug}`));
            }
          }

          // Fetch next feed index if not provided
          let feedIndex: number;
          if (options.feedIndex) {
            feedIndex = parseInt(options.feedIndex);
          } else {
            if (!options.quiet && spinner) {
              spinner.start('Fetching next feed index...');
            }
            const fetchedIndex = await fetchNextFeedIndex(
              feedOwnerKey,
              options.gateway || DEFAULT_GATEWAY_URL
            );
            if (fetchedIndex !== null) {
              feedIndex = fetchedIndex;
              if (!options.quiet && spinner) {
                spinner.succeed(`Using feed index: ${feedIndex}`);
              }
            } else {
              feedIndex = 0; // Fallback to 0 for new feeds
              if (!options.quiet && spinner) {
                spinner.warn('Could not fetch feed index, using default: 0');
              }
            }
          }

          if (!options.quiet && spinner) {
            spinner.start('Updating feed...');
          }

          await updateFeed({
            reference: result.reference,
            reserveKey: options.key,
            batchId: options.batchId,
            gateway: options.gateway,
            index: feedIndex,
            depth,
            project: options.project
          });

          if (!options.quiet && spinner) {
            spinner.succeed(chalk.green('Feed updated successfully'));
          }

        }

        // Output results
        if (options.output === 'json') {
          const output: any = {
            reference: result.reference,
            url: result.url,
            cid: result.cid
          };

          console.log(JSON.stringify(output, null, 2));
        } else {
          if (!options.quiet) {
            console.log('\n' + chalk.bold.green('✓ Upload successful!\n'));
            console.log(chalk.gray('Reference:'), chalk.white(result.reference));
            console.log(chalk.gray('CID:      '), chalk.white(result.cid));
            console.log(chalk.gray('URL:      '), chalk.cyan(result.url));
          } else {
            console.log(result.reference);
          }
        }
      } catch (error) {
        if (spinner) {
          spinner.fail(chalk.red('Upload failed'));
        }

        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);

        if (options.verbose) {
          console.error(chalk.gray('\n=== Verbose Error Details ==='));
          if (error instanceof Error) {
            console.error(chalk.gray('Stack trace:'));
            console.error(error.stack);
          }

          // Show axios error details if it's an HTTP error
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as any;
            console.error(chalk.gray('\nHTTP Error Details:'));
            console.error(chalk.gray('Status:'), axiosError.response?.status);
            console.error(chalk.gray('Status Text:'), axiosError.response?.statusText);
            console.error(chalk.gray('URL:'), axiosError.config?.url);
            console.error(chalk.gray('Method:'), axiosError.config?.method?.toUpperCase());
            if (axiosError.response?.headers) {
              console.error(chalk.gray('Response Headers:'), JSON.stringify(axiosError.response.headers, null, 2));
            }
            if (axiosError.response?.data) {
              console.error(chalk.gray('Response Data:'), JSON.stringify(axiosError.response.data, null, 2));
            }
          }

          console.error(chalk.gray('\nFull error object:'));
          console.error(JSON.stringify(error, null, 2));
        }

        process.exit(1);
      }
    });

  return command;
}
