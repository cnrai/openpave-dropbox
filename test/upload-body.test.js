// Regression tests for issue #10: `upload` must stream the file from disk
// instead of buffering it into a curl command-line argument.
//
// Before the fix, uploadFile() read the whole file into a Buffer and
// proxyFetch() serialized it with JSON.stringify() into a single `-d <body>`
// argv element. execve caps one argument at MAX_ARG_STRLEN (128 KiB on Linux)
// and the whole argv+env at ARG_MAX (1 MB on macOS), so any file above ~285 KB
// (macOS) / ~36 KB (Linux) died with E2BIG before curl ran. The same Buffer
// also serialized to a JSON envelope rather than the raw bytes.
//
// Harness: a local HTTP server emulates the PAVE auth proxy's _mode=json
// contract ({ok, status, headers, body}) and records every upstream request;
// the skill CLI runs as a child process with PAVE_PROXY_URL pointed at it.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SKILL = path.join(__dirname, '..', 'index.js');

let server;
let proxyUrl;
let requests; // recorded upstream calls
let responders; // path suffix -> (req, body) => {ok, status, headers, body}

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const record = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(record);
      const key = Object.keys(responders).find((k) => req.url.includes(k));
      const out = key
        ? responders[key](record)
        : { ok: false, status: 404, headers: {}, body: JSON.stringify({ error_summary: 'mock/no-route/' + req.url }) };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  proxyUrl = 'http://127.0.0.1:' + server.address().port + '/proxy';
});

after(() => server.close());

beforeEach(() => {
  requests = [];
  responders = {};
});

// Async on purpose: the mock proxy runs in THIS process, so a sync exec would
// block the event loop and deadlock the skill's curl against our own server.
function runSkill(args) {
  return new Promise((resolve, reject) => {
    execFile('node', [SKILL].concat(args), {
      encoding: 'utf8',
      env: { ...process.env, PAVE_PROXY_URL: proxyUrl },
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); return; }
      resolve(stdout);
    });
  });
}

function apiArgOf(record) {
  return JSON.parse(record.headers['dropbox-api-arg']);
}

const UPLOAD_RESPONSE = {
  ok: true, status: 200, headers: {},
  body: JSON.stringify({
    name: 'diagram.png',
    path_display: '/CnR/diagram.png',
    size: 1234567,
    id: 'id:TESTFILEID',
  }),
};

function writeTempFile(bytes) {
  const p = path.join(
    os.tmpdir(),
    'upload-test-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.bin',
  );
  fs.writeFileSync(p, crypto.randomBytes(bytes));
  return p;
}

describe('#10 upload streams the file body instead of passing it as an argument', () => {
  it('uploads a 1.2 MB binary file byte-for-byte (E2BIG before the fix)', async () => {
    responders['/2/files/upload'] = () => UPLOAD_RESPONSE;
    const tmp = writeTempFile(Math.floor(1.2 * 1024 * 1024));
    try {
      const expected = fs.readFileSync(tmp);
      const out = await runSkill(['upload', tmp, '/CnR/diagram.png', '--mode', 'overwrite', '--summary']);

      assert.equal(requests.length, 1, 'exactly one upstream call');
      const r = requests[0];
      assert.match(r.url, /\/2\/files\/upload/);
      assert.deepEqual(apiArgOf(r), {
        path: '/CnR/diagram.png', mode: 'overwrite', autorename: false, mute: false,
      });
      assert.ok(
        r.body.equals(expected),
        'request body must be the raw file bytes, not a JSON envelope (got ' + r.body.length + ' bytes, expected ' + expected.length + ')',
      );
      assert.match(out, /Uploaded/, 'summary output should report the upload');
    } finally { fs.unlinkSync(tmp); }
  });

  it('still uploads a small file byte-for-byte', async () => {
    responders['/2/files/upload'] = () => UPLOAD_RESPONSE;
    const tmp = writeTempFile(2048);
    try {
      const expected = fs.readFileSync(tmp);
      await runSkill(['upload', tmp, '/CnR/small.bin']);
      assert.ok(requests[0].body.equals(expected), 'small file body must be byte-identical');
      assert.equal(apiArgOf(requests[0]).mode, 'overwrite', 'mode defaults to overwrite');
    } finally { fs.unlinkSync(tmp); }
  });

  it('spills an oversized in-memory JSON body to a temp file (proxyFetch guard)', async () => {
    // paperRequest/uploadRequest pass bodyFile, but request() still hands
    // proxyFetch an in-memory JSON string. Anything above the 32 KiB argv
    // threshold must be streamed from a temp file rather than interpolated
    // into the curl command.
    responders['/2/files/search_v2'] = () => ({
      ok: true, status: 200, headers: {}, body: JSON.stringify({ matches: [] }),
    });
    const query = 'q'.repeat(40 * 1024);
    await runSkill(['search', query]);

    assert.equal(requests.length, 1);
    const sent = JSON.parse(requests[0].body.toString('utf8'));
    assert.equal(sent.query, query, 'the oversized body must arrive intact');
    assert.equal(sent.query.length, 40 * 1024);

    // The spilled body must be cleaned up. It also has to sit at least two
    // directories deep: the sandbox refuses to unlink absolute paths with fewer
    // than 3 components, so /tmp/<file>.tmp would be written but never removed.
    const spillDir = path.join(os.tmpdir(), 'pave-proxy-bodies');
    assert.ok(
      spillDir.split(/[\\/]/).filter(Boolean).length >= 3,
      'spill directory must be deep enough for the sandbox unlink guard: ' + spillDir,
    );
    const leftover = fs.existsSync(spillDir)
      ? fs.readdirSync(spillDir).filter((f) => f.endsWith('.tmp'))
      : [];
    assert.deepEqual(leftover, [], 'spilled body files must be cleaned up');
  });
});
