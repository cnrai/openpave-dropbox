# openpave-dropbox

🗂️ Access Dropbox files, folders, and Paper documents with secure token handling.

## ⚠️ **CRITICAL USAGE NOTE FOR AI AGENTS**

### Paper Document Creation - Multi-line Content Issue

When creating Paper documents with multi-line content (headers, paragraphs, tables, etc.):

**❌ DON'T USE `--content` for multi-line text** - it gets truncated at the first newline due to shell argument parsing limitations.

**✅ ALWAYS USE `--input` with a file** for any content containing newlines:

```bash
# 1. Write content to a temporary file
echo "# Title

Multi-line content with headers, lists, and tables..." > /tmp/content.md

# 2. Use --input parameter
pave run dropbox paper-create "/CnR HR/Document.paper" --input /tmp/content.md --summary
```

### When to Use Each Method

| Content Type | Method | Example |
|--------------|--------|---------|
| **Single line** | `--content` | `--content "Simple one-line text"` |
| **Multi-line markdown** | `--input` | `--input /tmp/content.md` |
| **Headers & tables** | `--input` | `--input /tmp/formatted.md` |
| **Long documents** | `--input` | `--input /tmp/document.md` |

## Installation

```bash
# From local directory
pave install ~/path/to/openpave-dropbox

# From GitHub
pave install cnrai/openpave-dropbox
```

## Setup

### 1. Configure Token in PAVE

Add to `~/.pave/permissions.yaml` under `tokens`:

```yaml
tokens:
  dropbox:
    env: DROPBOX_REFRESH_TOKEN
    type: oauth
    domains:
      - api.dropboxapi.com
      - content.dropboxapi.com
    placement:
      type: header
      name: Authorization
      format: "Bearer {token}"
    refreshEnv: DROPBOX_REFRESH_TOKEN
    refreshUrl: https://api.dropboxapi.com/oauth2/token
    clientIdEnv: DROPBOX_APP_KEY
    clientSecretEnv: DROPBOX_APP_SECRET
```

### 2. Set Environment Variables

Add to `~/.pave/tokens.yaml`:

```bash
DROPBOX_REFRESH_TOKEN=your-refresh-token
DROPBOX_APP_KEY=your-app-key
DROPBOX_APP_SECRET=your-app-secret
```

### 3. Get Dropbox App Credentials

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Create a new app with "Full Dropbox" access
3. Note your App Key and App Secret
4. Generate a refresh token using the OAuth flow

## Usage

### Account & Navigation

```bash
# Get account info
pave run dropbox account --summary

# List root folder
pave run dropbox ls --summary

# List specific folder
pave run dropbox ls "/CnR HR" --summary

# Search files
pave run dropbox search "evaluation" --summary
pave run dropbox search "report" --path "/CnR HR"
```

### Paper Documents

```bash
# List Paper documents
pave run dropbox paper "/CnR HR" --summary

# Search Paper documents
pave run dropbox paper-search "performance review" --summary

# Read a Paper document
pave run dropbox read "/CnR HR/Employee Handbook.paper"
```

### Creating Paper Documents

#### ✅ **Correct Method for Multi-line Content**

```bash
# Step 1: Create content file (use the 'write' tool in PAVE)
# Content example:
# # Employee Performance Review
# 
# **Employee:** John Doe
# **Position:** Software Developer
# 
# ## Evaluation Summary
# 
# | Criteria | Rating | Notes |
# |----------|--------|-------|
# | Performance | 4/5 | Excellent work quality |
# | Teamwork | 5/5 | Great collaboration |

# Step 2: Create the Paper document
pave run dropbox paper-create "/CnR HR/John_Doe_Review_2026.paper" --input /tmp/review.md --summary
```

#### ❌ **Wrong Method (gets truncated)**

```bash
# This will only save "# Employee Performance Review" and truncate the rest!
pave run dropbox paper-create "/CnR HR/Review.paper" --content "# Employee Performance Review

**Employee:** John Doe..." --summary
```

#### ✅ **Acceptable for Single-line Content**

```bash
# This works fine for simple, single-line content
pave run dropbox paper-create "/CnR HR/Quick Note.paper" --content "Meeting scheduled for next Tuesday" --summary
```

### Updating Paper Documents

```bash
# Update with file content (recommended)
pave run dropbox paper-update "/CnR HR/document.paper" --input /tmp/updated.md --summary

# Append to existing content
pave run dropbox paper-update "/CnR HR/document.paper" --input /tmp/addition.md --policy update --summary

# Simple single-line update
pave run dropbox paper-update "/CnR HR/document.paper" --content "Updated note" --summary
```

### File Operations

```bash
# Get file info
pave run dropbox info "/CnR HR/document.paper" --summary

# Create shared link
pave run dropbox link "/CnR HR/document.paper"

# Download file
pave run dropbox download "/CnR/report.pdf" --output /tmp/report.pdf
```

## Commands Reference

| Command | Purpose | Key Options |
|---------|---------|-------------|
| `account` | Get account info | `--summary` |
| `ls [path]` | List folders/files | `--recursive`, `--limit` |
| `search <query>` | Search by name | `--path`, `--max` |
| `paper [path]` | List Paper docs | `--summary` |
| `paper-search <query>` | Search Paper content | `--max` |
| `read <path>` | Read Paper content | `--format` |
| `paper-create <path>` | **Create Paper doc** | `--input` (recommended), `--content` |
| `paper-update <path>` | **Update Paper doc** | `--input` (recommended), `--policy` |
| `info <path>` | File metadata | `--summary` |
| `link <path>` | Shared link | - |
| `download <path>` | Download file | `--output` |

## Common Dropbox Folders (C&R)

| Path | Purpose |
|------|---------|
| `/CnR HR/` | HR documents, evaluations, policies |
| `/CnR Management/` | Management documents, strategies |
| `/CnR/` | General company documents |
| `/CnR Engagement/` | Client engagement materials |
| `/CnR Accounting/` | Financial documents |

## Troubleshooting

### Content Not Appearing in Paper Documents

**Symptoms:** Document created successfully but content is empty or truncated

**Cause:** Using `--content` with multi-line text - shell argument parsing truncates at newlines

**Solution:**
1. Save content to a temporary file first
2. Use `--input` parameter instead of `--content`

```bash
# Instead of this (broken):
pave run dropbox paper-create "/path/doc.paper" --content "# Title
Content with newlines..."

# Do this (works):
# First: write content to file
# Then: pave run dropbox paper-create "/path/doc.paper" --input /tmp/content.md
```

### Permission Errors

If you get permission errors, ensure your tokens are correctly configured in `~/.pave/permissions.yaml` and `~/.pave/tokens.yaml`.

## Security

This skill uses the PAVE sandbox secure token system:
- OAuth tokens are never exposed to skill code
- Network access restricted to Dropbox API domains only
- File operations limited to allowed paths

## License

MIT
