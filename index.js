#!/usr/bin/env node
/**
 * Dropbox Skill for PAVE
 * 
 * Access Dropbox files, folders, and Paper documents.
 * Uses PAVE sandbox with secure OAuth token handling.
 * Compatible with SpiderMonkey sandbox (no optional chaining, no async/await).
 */

var fs = require('fs');
var path = require('path');

/**
 * Safe nested property access (replaces optional chaining)
 */
function safeGet(obj, path, defaultVal) {
  if (!obj) return defaultVal;
  var parts = path.split('.');
  var current = obj;
  for (var i = 0; i < parts.length; i++) {
    if (current === null || current === undefined) return defaultVal;
    current = current[parts[i]];
  }
  return current !== undefined ? current : defaultVal;
}

// Parse command line arguments  
var args = process.argv.slice(2);

function parseArgs() {
  var parsed = {
    command: null,
    positional: [],
    options: {}
  };
  
  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (arg.charAt(0) === '-') {
      if (arg.charAt(1) === '-') {
        // Long option
        var eqIdx = arg.indexOf('=');
        var key, value;
        if (eqIdx > 0) {
          key = arg.slice(2, eqIdx);
          value = arg.slice(eqIdx + 1);
        } else {
          key = arg.slice(2);
          if (i + 1 < args.length && args[i + 1].charAt(0) !== '-') {
            value = args[i + 1];
            i++;
          } else {
            value = true;
          }
        }
        parsed.options[key] = value;
      } else {
        // Short option
        var flag = arg.slice(1);
        if (i + 1 < args.length && args[i + 1].charAt(0) !== '-') {
          parsed.options[flag] = args[i + 1];
          i++;
        } else {
          parsed.options[flag] = true;
        }
      }
    } else {
      if (parsed.command === null) {
        parsed.command = arg;
      } else {
        parsed.positional.push(arg);
      }
    }
  }
  
  return parsed;
}

// Dropbox Client Class
function DropboxClient() {
  this.apiUrl = 'https://api.dropboxapi.com/2';
  this.contentUrl = 'https://content.dropboxapi.com/2';
  this.timeout = 30000;
}

/**
 * Make an authenticated request (uses secure token system)
 */
DropboxClient.prototype.authenticatedRequest = function(url, options) {
  options = options || {};
  
  // Use secure token system (handles all token management automatically)
  return authenticatedFetch('dropbox', url, options);
};

/**
 * Make an RPC-style request to Dropbox API
 */
DropboxClient.prototype.request = function(endpoint, body) {
  var url = this.apiUrl + endpoint;
  
  var options = {
    method: 'POST',
    headers: {},
    timeout: this.timeout
  };
  
  if (body !== null && body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  
  var response = this.authenticatedRequest(url, options);
  var text = response.text();
  
  if (!response.ok) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { error: text };
    }
    var errMsg = data.error_summary || data.error_description || 
                 safeGet(data, 'error.message', null) || text || 'API request failed';
    var err = new Error(errMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  
  return text ? JSON.parse(text) : {};
};

/**
 * Make a content download request
 */
DropboxClient.prototype.downloadRequest = function(endpoint, apiArg) {
  var url = this.contentUrl + endpoint;
  
  var response = this.authenticatedRequest(url, {
    method: 'POST',
    headers: {
      'Dropbox-API-Arg': JSON.stringify(apiArg)
    },
    timeout: this.timeout
  });
  
  if (!response.ok) {
    var text = response.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { error: text };
    }
    var err = new Error(data.error_summary || 'Download failed');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  
  return response;
};

/**
 * Make a content upload request
 */
DropboxClient.prototype.uploadRequest = function(endpoint, apiArg, content) {
  var url = this.apiUrl + endpoint;
  
  var response = this.authenticatedRequest(url, {
    method: 'POST',
    headers: {
      'Dropbox-API-Arg': JSON.stringify(apiArg),
      'Content-Type': 'application/octet-stream'
    },
    body: content,
    timeout: this.timeout
  });
  
  var text = response.text();
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { error: text };
  }
  
  if (!response.ok) {
    var err = new Error(data.error_summary || safeGet(data, 'error.message', null) || text || 'Upload failed');
    err.status = response.status;
    err.data = data;
    throw err;
  }
  
  return data;
};

/**
 * Get current account info
 */
DropboxClient.prototype.getCurrentAccount = function() {
  return this.request('/users/get_current_account', null);
};

/**
 * List folder contents
 */
DropboxClient.prototype.listFolder = function(folderPath, options) {
  options = options || {};
  return this.request('/files/list_folder', {
    path: folderPath || '',
    recursive: options.recursive || false,
    include_media_info: options.includeMediaInfo || false,
    include_deleted: options.includeDeleted || false,
    include_has_explicit_shared_members: false,
    include_mounted_folders: true,
    limit: options.limit || 100
  });
};

/**
 * Continue listing folder contents
 */
DropboxClient.prototype.listFolderContinue = function(cursor) {
  return this.request('/files/list_folder/continue', { cursor: cursor });
};

/**
 * Search for files and folders
 */
DropboxClient.prototype.search = function(query, options) {
  options = options || {};
  var body = {
    query: query,
    options: {
      max_results: options.maxResults || 20,
      file_status: 'active'
    }
  };
  
  if (options.path) {
    body.options.path = options.path;
  }
  
  if (options.fileExtensions) {
    body.options.file_extensions = options.fileExtensions;
  }
  
  if (options.fileCategories) {
    body.options.file_categories = options.fileCategories;
  }
  
  return this.request('/files/search_v2', body);
};

/**
 * Get file metadata
 */
DropboxClient.prototype.getMetadata = function(filePath) {
  return this.request('/files/get_metadata', {
    path: filePath,
    include_media_info: true
  });
};

/**
 * Download a file
 */
DropboxClient.prototype.downloadFile = function(filePath) {
  var response = this.downloadRequest('/files/download', { path: filePath });
  return response.text();
};

/**
 * List Paper docs
 */
DropboxClient.prototype.listPaperDocs = function(folderPath) {
  return this.search('.paper', {
    path: folderPath || undefined,
    maxResults: 100,
    fileExtensions: ['paper']
  });
};

/**
 * Get Paper doc content as markdown
 */
DropboxClient.prototype.getPaperDocContent = function(docPath, exportFormat) {
  var response = this.downloadRequest('/files/export', {
    path: docPath,
    export_format: exportFormat || 'markdown'
  });
  return response.text();
};

/**
 * Search Paper docs by content
 */
DropboxClient.prototype.searchPaperDocs = function(query, options) {
  options = options || {};
  options.fileExtensions = ['paper'];
  return this.search(query, options);
};

/**
 * Create a new Paper document
 */
DropboxClient.prototype.createPaperDoc = function(docPath, content, importFormat) {
  return this.uploadRequest('/files/paper/create', {
    path: docPath,
    import_format: importFormat || 'markdown'
  }, content);
};

/**
 * Update an existing Paper document
 */
DropboxClient.prototype.updatePaperDoc = function(docPath, content, importFormat, updatePolicy) {
  return this.uploadRequest('/files/paper/update', {
    path: docPath,
    import_format: importFormat || 'markdown',
    doc_update_policy: updatePolicy || 'overwrite'
  }, content);
};

/**
 * Get shared link for a file
 */
DropboxClient.prototype.getSharedLink = function(filePath) {
  try {
    var existing = this.request('/sharing/list_shared_links', {
      path: filePath,
      direct_only: true
    });
    
    if (existing.links && existing.links.length > 0) {
      return existing.links[0];
    }
    
    return this.request('/sharing/create_shared_link_with_settings', {
      path: filePath,
      settings: {
        requested_visibility: 'public'
      }
    });
  } catch (error) {
    var sharedLink = safeGet(error, 'data.error.shared_link_already_exists.metadata', null);
    if (sharedLink) {
      return sharedLink;
    }
    throw error;
  }
};

// Format file size
function formatSize(bytes) {
  if (!bytes) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes = bytes / 1024;
    i++;
  }
  return (i > 0 ? bytes.toFixed(1) : bytes.toFixed(0)) + ' ' + units[i];
}

// Print folder listing summary
function printFolderSummary(result) {
  var entries = result.entries || [];
  
  if (entries.length === 0) {
    console.log('Folder is empty.');
    return;
  }
  
  console.log('Found ' + entries.length + ' items:\n');
  
  var folders = [];
  var files = [];
  for (var i = 0; i < entries.length; i++) {
    if (entries[i]['.tag'] === 'folder') {
      folders.push(entries[i]);
    } else {
      files.push(entries[i]);
    }
  }
  
  for (var j = 0; j < folders.length; j++) {
    console.log('[DIR]  ' + folders[j].name + '/');
  }
  
  for (var k = 0; k < files.length; k++) {
    var file = files[k];
    var size = formatSize(file.size);
    var modified = file.client_modified ? new Date(file.client_modified).toLocaleDateString() : '';
    console.log('[FILE] ' + file.name + ' (' + size + ') ' + modified);
  }
  
  if (result.has_more) {
    console.log('\n... more items available (use --limit to increase)');
  }
}

// Print search results summary
function printSearchSummary(result, query) {
  var matches = result.matches || [];
  
  if (matches.length === 0) {
    console.log('No results found for "' + query + '".');
    return;
  }
  
  console.log('Found ' + matches.length + ' result(s) for "' + query + '":\n');
  
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var metadata = safeGet(match, 'metadata.metadata', null) || match.metadata;
    if (!metadata) continue;
    
    var tag = metadata['.tag'];
    var filePath = metadata.path_display || metadata.name;
    
    if (tag === 'folder') {
      console.log('[DIR]  ' + filePath);
    } else {
      var size = formatSize(metadata.size);
      console.log('[FILE] ' + filePath + ' (' + size + ')');
    }
  }
  
  if (result.has_more) {
    console.log('\n... more results available');
  }
}

// Print Paper docs summary
function printPaperDocsSummary(result) {
  var matches = result.matches || [];
  
  if (matches.length === 0) {
    console.log('No Paper documents found.');
    return;
  }
  
  console.log('Found ' + matches.length + ' Paper document(s):\n');
  
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var metadata = safeGet(match, 'metadata.metadata', null) || match.metadata;
    if (!metadata) continue;
    
    var filePath = metadata.path_display || metadata.name;
    var modified = metadata.client_modified ? new Date(metadata.client_modified).toLocaleDateString() : '';
    console.log(filePath + ' (' + modified + ')');
  }
}

// Print help
function printHelp() {
  console.log('');
  console.log('Dropbox Skill - Access files, folders, and Paper documents');
  console.log('');
  console.log('USAGE:');
  console.log('  dropbox <command> [options]');
  console.log('');
  console.log('COMMANDS:');
  console.log('  account                     Get current account info');
  console.log('  ls [path]                   List folder contents');
  console.log('  search <query>              Search files and folders');
  console.log('  paper [path]                List Paper documents');
  console.log('  paper-search <query>        Search Paper documents');
  console.log('  read <path>                 Read Paper document content');
  console.log('  paper-create <path>         Create a new Paper document');
  console.log('  paper-update <path>         Update an existing Paper document');
  console.log('  info <path>                 Get file/folder metadata');
  console.log('  link <path>                 Get or create shared link');
  console.log('  download <path>             Download a file');
  console.log('');
  console.log('OPTIONS:');
  console.log('  --summary                   Human-readable output');
  console.log('  --json                      Raw JSON output');
  console.log('  -r, --recursive             List recursively');
  console.log('  -n, --limit <number>        Maximum results (default: 100)');
  console.log('  -p, --path <path>           Limit search to a specific path');
  console.log('  -e, --ext <extensions>      Filter by file extensions');
  console.log('  -f, --format <format>       Export format: markdown or html');
  console.log('  -c, --content <text>        Document content (inline)');
  console.log('  -i, --input <file>          Read content from a local file');
  console.log('  --policy <policy>           Update policy: update or overwrite');
  console.log('  -o, --output <file>         Save downloaded file to disk');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  dropbox account --summary');
  console.log('  dropbox ls --summary');
  console.log('  dropbox ls "/CnR" --summary');
  console.log('  dropbox search "MTR" --summary');
  console.log('  dropbox read "/CnR/Notes.paper"');
  console.log('  dropbox paper-create "/Notes/New.paper" --content "# Title"');
  console.log('  dropbox link "/file.pdf"');
  console.log('');
}

// Main execution function
function main() {
  var parsed = parseArgs();
  
  if (!parsed.command || parsed.command === 'help' || parsed.options.help || parsed.options.h) {
    printHelp();
    return;
  }
  
  try {
    var client = new DropboxClient();
    var result;
    
    switch (parsed.command) {
      case 'account':
        result = client.getCurrentAccount();
        
        if (parsed.options.summary) {
          console.log('Account: ' + safeGet(result, 'name.display_name', 'Unknown'));
          console.log('Email: ' + (result.email || 'Unknown'));
          console.log('Account ID: ' + (result.account_id || 'Unknown'));
          console.log('Country: ' + (result.country || 'Unknown'));
          if (result.team) {
            console.log('Team: ' + (result.team.name || 'Unknown'));
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'ls':
        var folderPath = parsed.positional[0] || '';
        var lsOptions = {
          recursive: parsed.options.recursive || parsed.options.r || false,
          limit: parseInt(parsed.options.limit || parsed.options.n, 10) || 100
        };
        
        result = client.listFolder(folderPath, lsOptions);
        
        if (parsed.options.summary) {
          printFolderSummary(result);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'search':
        var searchQuery = parsed.positional[0];
        if (!searchQuery) {
          console.error('Error: Search query required');
          console.error('Usage: dropbox search <query>');
          process.exit(1);
        }
        
        var searchOptions = {
          maxResults: parseInt(parsed.options.max || parsed.options.n, 10) || 20
        };
        
        if (parsed.options.path || parsed.options.p) {
          searchOptions.path = parsed.options.path || parsed.options.p;
        }
        
        if (parsed.options.ext || parsed.options.e) {
          var extValue = parsed.options.ext || parsed.options.e;
          searchOptions.fileExtensions = extValue.split(',');
        }
        
        result = client.search(searchQuery, searchOptions);
        
        if (parsed.options.summary) {
          printSearchSummary(result, searchQuery);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'paper':
        var paperFolder = parsed.positional[0] || '';
        result = client.listPaperDocs(paperFolder);
        
        if (parsed.options.summary) {
          printPaperDocsSummary(result);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'paper-search':
        var paperQuery = parsed.positional[0];
        if (!paperQuery) {
          console.error('Error: Search query required');
          console.error('Usage: dropbox paper-search <query>');
          process.exit(1);
        }
        
        var paperSearchOptions = {
          maxResults: parseInt(parsed.options.max || parsed.options.n, 10) || 20
        };
        
        result = client.searchPaperDocs(paperQuery, paperSearchOptions);
        
        if (parsed.options.summary) {
          printSearchSummary(result, paperQuery);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'read':
        var readPath = parsed.positional[0];
        if (!readPath) {
          console.error('Error: Paper doc path required');
          console.error('Usage: dropbox read <path>');
          process.exit(1);
        }
        
        var readFormat = parsed.options.format || parsed.options.f || 'markdown';
        var content = client.getPaperDocContent(readPath, readFormat);
        console.log(content);
        break;
      
      case 'paper-create':
        var createPath = parsed.positional[0];
        if (!createPath) {
          console.error('Error: Paper doc path required');
          process.exit(1);
        }
        
        var createContent;
        if (parsed.options.input || parsed.options.i) {
          var inputFile = parsed.options.input || parsed.options.i;
          createContent = fs.readFileSync(inputFile, 'utf-8');
        } else if (parsed.options.content || parsed.options.c) {
          createContent = parsed.options.content || parsed.options.c;
        } else {
          console.error('Error: Either --content or --input is required');
          process.exit(1);
        }
        
        var createFormat = parsed.options.format || parsed.options.f || 'markdown';
        result = client.createPaperDoc(createPath, createContent, createFormat);
        
        if (parsed.options.summary) {
          console.log('Created: ' + (result.path_display || createPath));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'paper-update':
        var updatePath = parsed.positional[0];
        if (!updatePath) {
          console.error('Error: Paper doc path required');
          process.exit(1);
        }
        
        var updateContent;
        if (parsed.options.input || parsed.options.i) {
          var updateInputFile = parsed.options.input || parsed.options.i;
          updateContent = fs.readFileSync(updateInputFile, 'utf-8');
        } else if (parsed.options.content || parsed.options.c) {
          updateContent = parsed.options.content || parsed.options.c;
        } else {
          console.error('Error: Either --content or --input is required');
          process.exit(1);
        }
        
        var updateFormat = parsed.options.format || parsed.options.f || 'markdown';
        var updatePolicy = parsed.options.policy || 'overwrite';
        result = client.updatePaperDoc(updatePath, updateContent, updateFormat, updatePolicy);
        
        if (parsed.options.summary) {
          console.log('Updated: ' + (result.path_display || updatePath));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'info':
        var infoPath = parsed.positional[0];
        if (!infoPath) {
          console.error('Error: File path required');
          process.exit(1);
        }
        
        result = client.getMetadata(infoPath);
        
        if (parsed.options.summary) {
          console.log('Name: ' + result.name);
          console.log('Type: ' + result['.tag']);
          console.log('Path: ' + result.path_display);
          if (result.size !== undefined) {
            console.log('Size: ' + formatSize(result.size));
          }
          if (result.client_modified) {
            console.log('Modified: ' + new Date(result.client_modified).toLocaleString());
          }
          if (result.id) {
            console.log('ID: ' + result.id);
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      
      case 'link':
        var linkPath = parsed.positional[0];
        if (!linkPath) {
          console.error('Error: File path required');
          process.exit(1);
        }
        
        result = client.getSharedLink(linkPath);
        
        if (parsed.options.summary) {
          console.log('Shared link: ' + result.url);
        } else {
          console.log(result.url);
        }
        break;
      
      case 'download':
        var downloadPath = parsed.positional[0];
        if (!downloadPath) {
          console.error('Error: File path required');
          process.exit(1);
        }
        
        var downloadContent = client.downloadFile(downloadPath);
        
        if (parsed.options.output || parsed.options.o) {
          var outputFile = parsed.options.output || parsed.options.o;
          fs.writeFileSync(outputFile, downloadContent);
          console.log('Saved to ' + outputFile);
        } else {
          console.log(downloadContent);
        }
        break;
      
      default:
        console.error('Error: Unknown command "' + parsed.command + '"');
        console.error('\nRun: dropbox help');
        process.exit(1);
    }
    
  } catch (error) {
    if (parsed.options.summary) {
      console.error('Dropbox Error: ' + error.message);
    } else {
      console.error(JSON.stringify({
        error: error.message,
        status: error.status,
        data: error.data
      }, null, 2));
    }
    process.exit(1);
  }
}

// Execute
main();
