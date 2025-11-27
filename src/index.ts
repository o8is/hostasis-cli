#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { createRequire } from 'module';
import { createUploadCommand } from './commands/upload.js';
import { createFeedCommand } from './commands/feed.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('hostasis')
  .description('Hostasis CLI - Upload files to Swarm and manage feeds with client-side stamping')
  .version(version);

// Add commands
program.addCommand(createUploadCommand());
program.addCommand(createFeedCommand());

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

// Parse arguments
program.parse(process.argv);
