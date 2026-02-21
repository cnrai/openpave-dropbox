# openpave-dropbox

Dropbox skill for PAVE - access files, folders, and Paper documents.

## Features

- **List Folders** - Browse Dropbox directory contents
- **Search Files** - Find files and folders by name
- **Paper Documents** - List, read, create, and update Paper docs
- **File Info** - Get metadata for files and folders
- **Shared Links** - Generate shareable links
- **Download** - Download files to local storage

## Installation

```bash
# Install from GitHub
pave install cnrai/openpave-dropbox

# Or install from local path
pave install /path/to/openpave-dropbox
```

## Configuration

Add your Dropbox OAuth credentials to your environment:

```bash
# In your .env file
DROPBOX_APP_KEY=your_app_key
DROPBOX_APP_SECRET=your_app_secret
DROPBOX_REFRESH_TOKEN=your_refresh_token
```

Get your credentials from the [Dropbox App Console](https://www.dropbox.com/developers/apps).

## Usage

```bash
# Get account info
pave run dropbox account --summary

# List root folder
pave run dropbox ls --summary

# List specific folder
pave run dropbox ls "/Documents" --summary

# List recursively
pave run dropbox ls "/Projects" --recursive --summary

# Search files
pave run dropbox search "invoice" --summary

# Search in specific path
pave run dropbox search "report" --path "/Work" --summary

# List Paper documents
pave run dropbox paper --summary

# Search Paper documents
pave run dropbox paper-search "meeting notes" --summary

# Read Paper document content
pave run dropbox read "/Notes/Ideas.paper"

# Create Paper document
pave run dropbox paper-create "/Notes/New.paper" --content "# My Document"

# Update Paper document
pave run dropbox paper-update "/Notes/Existing.paper" --content "# Updated"

# Get file metadata
pave run dropbox info "/file.pdf" --summary

# Get shared link
pave run dropbox link "/file.pdf"

# Download file
pave run dropbox download "/file.txt" --output tmp/file.txt
```

## Commands

| Command | Description |
|---------|-------------|
| `account` | Get current Dropbox account info |
| `ls [path]` | List folder contents |
| `search <query>` | Search files and folders |
| `paper [path]` | List Paper documents |
| `paper-search <query>` | Search Paper documents |
| `read <path>` | Read Paper document as markdown |
| `paper-create <path>` | Create new Paper document |
| `paper-update <path>` | Update existing Paper document |
| `info <path>` | Get file/folder metadata |
| `link <path>` | Get or create shared link |
| `download <path>` | Download a file |

## Options

| Option | Description |
|--------|-------------|
| `--summary` | Human-readable output |
| `--json` | Raw JSON output |
| `-r, --recursive` | List folders recursively |
| `-n, --limit <number>` | Maximum results (default: 100) |
| `-p, --path <path>` | Limit search to specific path |
| `-e, --ext <extensions>` | Filter by file extensions |
| `-f, --format <format>` | Export format: markdown or html |
| `-c, --content <text>` | Document content (inline) |
| `-i, --input <file>` | Read content from local file |
| `--policy <policy>` | Update policy: update or overwrite |
| `-o, --output <file>` | Save downloaded file to disk |

## Examples

### List Recent Files

```bash
pave run dropbox ls --limit 20 --summary
```

### Search for PDFs

```bash
pave run dropbox search "report" --ext pdf --summary
```

### Create Paper Document from File

```bash
pave run dropbox paper-create "/Notes/README.paper" --input ./README.md
```

### Append to Paper Document

```bash
pave run dropbox paper-update "/Notes/Log.paper" --content "New entry" --policy update
```

## Security

This skill uses PAVE's secure token system with OAuth. Your credentials are never exposed to the sandbox code - tokens are injected at the host level during authenticated requests.

## Required Scopes

- `files.metadata.read` - Read file metadata
- `files.content.read` - Download files
- `files.content.write` - Create/update Paper docs
- `sharing.read` - List shared links
- `sharing.write` - Create shared links

## License

MIT
