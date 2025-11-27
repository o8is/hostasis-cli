# Hostasis CLI

Command-line interface for uploading files to Swarm and managing feeds with client-side stamping.

## Quick Start - GitHub Actions (Easiest Way!)

Deploy your web app to Swarm with just 3 lines:

```yaml
- uses: hostasis/hostasis-cli@v1
  with:
    batch-id: ${{ secrets.HOSTASIS_BATCH_ID }}
    key: ${{ secrets.HOSTASIS_KEY }}
    path: ./dist
```

### Complete Workflow Example

```yaml
name: Deploy to Swarm

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build
        run: npm ci && npm run build

      - name: Deploy to Swarm
        uses: hostasis/hostasis-cli@v1
        with:
          batch-id: ${{ secrets.HOSTASIS_BATCH_ID }}
          key: ${{ secrets.HOSTASIS_KEY }}
          path: ./dist
          project: my-app  # Optional: separate feed for this project
          spa: true  # Enable for React, Vue, Angular, etc.
```

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `batch-id` | Yes | - | Your postage batch ID |
| `key` | Yes | - | Your reserve private key |
| `path` | Yes | `dist` | Path to built files |
| `project` | No | - | Project name (derives feed key from reserve key) |
| `gateway` | No | `https://bzz.sh` | Swarm gateway URL |
| `index-document` | No | `index.html` | Index file for websites |
| `spa` | No | `false` | Enable SPA mode |

### Action Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `reference` | Swarm reference hash | `abc123...` |
| `url` | Full URL to content | `https://bzz.sh/bzz/abc123...` |
| `cid` | Content ID | `bah5...` |
| `feed-url` | Feed URL (always latest) | `https://bzz.sh/bzz/owner/topic` |

### Using Outputs

```yaml
- name: Deploy to Swarm
  id: deploy
  uses: hostasis/hostasis-cli@v1
  with:
    batch-id: ${{ secrets.HOSTASIS_BATCH_ID }}
    key: ${{ secrets.HOSTASIS_KEY }}
    path: ./dist

- name: Use deployment URL
  run: echo "Deployed to ${{ steps.deploy.outputs.url }}"
```

### Required Secrets

Add these in repository settings: **Settings → Secrets and variables → Actions**

- **`HOSTASIS_BATCH_ID`**: Your postage batch ID (get from [Hostasis app](https://hostasis.io))
- **`HOSTASIS_KEY`**: Your reserve private key (use "Export Reserve Key" button)

**⚠️ Security Note:** Your reserve key can upload to your batch and update your feed. Store it securely in GitHub Secrets, never commit it!

### Framework Examples

See complete workflow examples in [`examples/workflows/`](./examples/workflows/):
- [React App](./examples/workflows/react-app.yml)
- [Vue App](./examples/workflows/vue-app.yml)
- [Static Site](./examples/workflows/static-site.yml)
- [Next.js Export](./examples/workflows/nextjs-export.yml)

---

## Installation

```bash
npm install -g @hostasis/cli
```

## Prerequisites

You'll need:
1. A **postage batch** on Swarm
2. Your **reserve private key** (exported from Hostasis web app)

## Commands

### `hostasis upload`

Upload files or directories to Swarm with client-side stamping.

**Basic usage:**

```bash
hostasis upload ./dist \
  --batch-id 0xYOUR_BATCH_ID \
  --key 0xYOUR_KEY
```

**Options:**

- `--batch-id <id>` (required): Your postage batch ID (hex)
- `--key <key>` (required): Your reserve private key for stamping (hex)
- `--project <name>`: Project name (derives feed signing key from reserve key)
- `--gateway <url>`: Swarm gateway URL (default: `https://bzz.sh`)
- `--index-document <file>`: Index document for websites (default: `index.html`)
- `--spa`: Enable Single Page App mode (routes all 404s to index.html)
- `--feed`: Automatically update feed after upload
- `--feed-index <number>`: Feed index for update (auto-fetches next index if not specified)
- `--depth <number>`: Batch depth (auto-fetches from batch if not specified)
- `--quiet`: Suppress progress output, only show reference
- `--output <format>`: Output format: `json` or `text` (default: `text`)

**Environment Variables:**

You can set these instead of passing as flags:
- `HOSTASIS_BATCH_ID`: Your postage batch ID
- `HOSTASIS_PRIVATE_KEY`: Your reserve private key
- `HOSTASIS_PROJECT`: Your project name

**Smart Defaults:**
- If `--depth` is not specified, the CLI automatically queries your batch to get the correct depth
- If `--feed-index` is not specified with `--feed`, the CLI automatically queries the current feed state to determine the next index

**Examples:**

```bash
# Upload a single file
hostasis upload ./file.txt \
  --batch-id 0x... \
  --key 0x...

# Upload a website directory
hostasis upload ./dist \
  --batch-id 0x... \
  --key 0x... \
  --index-document index.html

# Upload a React/Vue SPA
hostasis upload ./build \
  --batch-id 0x... \
  --key 0x... \
  --spa

# Upload with project-specific feed
hostasis upload ./dist \
  --batch-id 0x... \
  --key 0x... \
  --project my-blog \
  --feed

# Quiet mode (for scripts)
hostasis upload ./dist \
  --batch-id 0x... \
  --key 0x... \
  --quiet

# JSON output
hostasis upload ./dist \
  --batch-id 0x... \
  --key 0x... \
  --output json

# Upload and automatically update feed (auto-fetches depth and next index)
hostasis upload ./dist \
  --batch-id 0x... \
  --key 0x... \
  --feed

# Upload and update feed at specific index (manual override)
hostasis upload ./dist \
  --batch-id 0x... \
  --key 0x... \
  --feed \
  --feed-index 5 \
  --depth 20

# Use environment variables
export HOSTASIS_BATCH_ID=0x...
export HOSTASIS_PRIVATE_KEY=0x...
export HOSTASIS_PROJECT=my-portfolio

hostasis upload ./dist --feed
```

### `hostasis feed update`

Update a Swarm feed to point to new content.

**Basic usage:**

```bash
hostasis feed update \
  --reference 0xSWARM_HASH \
  --key 0xYOUR_KEY \
  --batch-id 0xYOUR_BATCH_ID
```

**Options:**

- `--reference <hash>` (required): Content reference (Swarm hash)
- `--key <key>` (required): Your reserve private key for stamping (hex)
- `--batch-id <id>` (required): Your postage batch ID (hex)
- `--project <name>`: Project name (derives feed signing key from reserve key)
- `--gateway <url>`: Swarm gateway URL (default: `https://bzz.sh`)
- `--index <number>`: Feed index (auto-fetches next index if not specified)
- `--topic <hex>`: Feed topic (defaults to NULL_TOPIC)
- `--depth <number>`: Batch depth (auto-fetches from batch if not specified)
- `--quiet`: Suppress progress output

**Environment Variables:**

You can set these instead of passing as flags:
- `HOSTASIS_BATCH_ID`: Your postage batch ID
- `HOSTASIS_PRIVATE_KEY`: Your reserve private key
- `HOSTASIS_PROJECT`: Your project name

**Smart Defaults:**
- If `--depth` is not specified, the CLI automatically queries your batch to get the correct depth
- If `--index` is not specified, the CLI automatically queries the current feed state to determine the next index

**Examples:**

```bash
# Update feed to new content (auto-fetches depth and next index)
hostasis feed update \
  --reference 0xabcd1234... \
  --key 0x... \
  --batch-id 0x...

# Update project-specific feed
hostasis feed update \
  --reference 0xabcd1234... \
  --key 0x... \
  --batch-id 0x... \
  --project my-blog

# Specify custom index and depth (manual override)
hostasis feed update \
  --reference 0xabcd1234... \
  --key 0x... \
  --batch-id 0x... \
  --index 5 \
  --depth 20

# Use environment variables
export HOSTASIS_BATCH_ID=0x...
export HOSTASIS_PRIVATE_KEY=0x...
export HOSTASIS_PROJECT=my-app

hostasis feed update --reference 0xabcd...
```

## GitHub Actions Integration

### Complete Workflow Example

```yaml
name: Deploy to Swarm

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Upload to Swarm and update feed
        run: |
          # Upload with client-side stamping and auto-update feed
          npx @hostasis/cli upload ./dist \
            --batch-id ${{ secrets.HOSTASIS_BATCH_ID }} \
            --key ${{ secrets.HOSTASIS_KEY }} \
            --project my-app \
            --gateway https://bzz.sh \
            --index-document index.html \
            --spa \
            --feed \
            --output json > upload.json

          # Display results
          REFERENCE=$(jq -r .reference upload.json)
          FEED_URL=$(jq -r .feedUrl upload.json)
          echo "✓ Deployed to feed!"
          echo "Reference: $REFERENCE"
          echo "Feed URL: $FEED_URL"
```

### Required Secrets

Add these to your repository secrets (`Settings > Secrets and variables > Actions`):

- `HOSTASIS_BATCH_ID`: Your postage batch ID (from Hostasis app)
- `HOSTASIS_KEY`: Your private key (from "Export Reserve Key" in Hostasis)

## Multi-Project Support

You can manage multiple projects (websites, apps) using a single reserve key and batch by specifying a `--project` name. Each project gets its own derived feed key.

**How it works:**
1. Your **reserve key** pays for stamping (owns the batch)
2. Each **project** gets a derived key for feed signing
3. The project key is deterministically derived: `keccak256(reserveKey || projectSlug)`
4. Each project has its own feed URL

**Benefits:**
- Use one batch for multiple projects
- Each project has a separate feed URL
- Organized, isolated deployments
- No key management overhead

**Example: Managing 3 projects with one key**

```bash
# Deploy blog
hostasis upload ./blog/dist --project my-blog --feed

# Deploy portfolio
hostasis upload ./portfolio/dist --project my-portfolio --feed

# Deploy docs
hostasis upload ./docs/dist --project my-docs --feed
```

Each project will have its own feed URL that always points to the latest version.

## Getting Your Key

1. Go to [Hostasis app](https://hostasis.io)
2. Navigate to your Reserves page
3. Click "Export Reserve Key" for the reserve you want to use
4. Authenticate with your passkey
5. Copy the private key
6. Store it securely in your CI/CD secrets

**⚠️ Security Note:** This key can upload to your batch and update your feed. Store it securely!

## How It Works

### Client-Side Stamping

Unlike traditional Swarm uploads where the gateway stamps chunks, Hostasis uses **client-side stamping**:

1. **Reserve keys** are derived from your passkey (one per reserve)
2. Each reserve key owns its postage batch
3. The CLI uses your reserve key to sign chunks locally
4. Chunks are uploaded pre-signed to the gateway

**Benefits:**
- No need to trust the gateway with your keys
- Works with any Swarm gateway
- Keys are safe to export for CLI/CI/CD use
- Full control over your uploads

### Feed Updates

Feeds are mutable pointers that you control:
- Each project gets a derived key that owns the feed (specify with `--project`)
- Feed updates are Single-Owner Chunks (SOCs) signed by the project key
- You can update the feed to point to new content anytime
- Users always get the latest version via the feed URL
- The reserve key still stamps chunks (pays for storage)

### Project-Based Keys

When you specify a `--project` name:
1. The project name is normalized to a slug (lowercase, hyphens, alphanumeric)
2. A project key is derived: `projectKey = keccak256(reserveKey || projectSlug)`
3. The reserve key still stamps chunks (pays for storage)
4. The project key signs feed updates (owns the feed)

This allows you to manage multiple projects with a single reserve key while keeping their feeds separate.

## Troubleshooting

### "Invalid batch ID format"

Make sure your batch ID is a 64-character hex string. You can include or omit the `0x` prefix.

### "Stamp did not propagate to gateway"

The CLI automatically waits for your batch to propagate to the gateway. If this fails:
- Ensure your batch has sufficient balance
- Try a different gateway with `--gateway`
- Wait a few minutes and try again

### "Feed update failed"

For feed updates, you need:
- The same reserve key that owns the batch
- A valid postage batch ID
- The batch must be recognized by the gateway

### "Invalid project slug"

Project names are normalized to slugs:
- Lowercase letters and numbers only
- Hyphens allowed (no spaces or underscores)
- Max 50 characters
- Examples: `my-blog`, `portfolio-2024`, `docs`

## License

MIT
