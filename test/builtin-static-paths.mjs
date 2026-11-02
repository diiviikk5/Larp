// Run with: node --test test/builtin-static-paths.mjs
// Exercise the real bundled-app HTTP server using disposable files and app data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { startBuiltinApps } from '../server/builtin-apps.mjs';

async function freePort() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

// http.get preserves the encoded request path, including encoded separators.
function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: requestPath }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

for (const [id, className, usualPort] of [['swasthya', 'Swasthya', 5191], ['kosh', 'Kosh', 5201]]) {
  test(`${id}: static files stay inside dist`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-static-'));
    const appDir = path.join(root, 'apps', id);
    const oldOffset = process.env.LARP_APPS_PORT_OFFSET;
    let servers = [];
    try {
      await fs.mkdir(path.join(appDir, 'server'), { recursive: true });
      await fs.mkdir(path.join(appDir, 'dist', 'assets'), { recursive: true });
      await fs.mkdir(path.join(appDir, 'dist', 'nested'), { recursive: true });
      await fs.mkdir(path.join(appDir, 'dist-private'), { recursive: true });
      const moduleUrl = new URL(`../apps/${id}/server/api.mjs`, import.meta.url).href;
      await fs.writeFile(path.join(appDir, 'server', 'api.mjs'), `export { ${className} } from ${JSON.stringify(moduleUrl)};\n`);
      await fs.writeFile(path.join(appDir, 'dist', 'index.html'), 'app index');
      await fs.writeFile(path.join(appDir, 'dist', 'nested', 'index.html'), 'nested index');
      await fs.writeFile(path.join(appDir, 'dist', 'assets', 'app.js'), 'asset content');
      await fs.writeFile(path.join(appDir, 'dist-private', 'marker.txt'), 'outside dist marker');
      await fs.writeFile(path.join(appDir, 'marker.txt'), 'parent marker');

      const port = await freePort();
      process.env.LARP_APPS_PORT_OFFSET = String(port - usualPort);
      servers = await startBuiltinApps({ appsDir: path.join(root, 'apps'), dataDir: path.join(root, 'data'), log: () => {} });
      assert.equal(servers.length, 1, 'fixture app started');
      for (const requestPath of ['/..%2fdist-private/marker.txt', '/%2e%2e%2fdist-private/marker.txt', '/..%2fmarker.txt']) {
        const response = await get(port, requestPath);
        assert.notEqual(response.body, 'outside dist marker', 'must not disclose a sibling file');
        assert.equal(response.status, 403, `reject ${requestPath}`);
        assert.equal(response.body, '', 'no outside file content');
      }
      if (process.platform === 'win32') {
        assert.equal((await get(port, '/..%5cdist-private%5cmarker.txt')).status, 403);
      }
      for (const [requestPath, body] of [['/', 'app index'], ['/nested/', 'nested index'], ['/assets/app.js', 'asset content'], ['/assets%2fapp.js', 'asset content'], ['/missing-page', 'app index']]) {
        assert.deepEqual(await get(port, requestPath), { status: 200, body });
      }
      assert.equal((await get(port, '/api/health')).status, 200, 'API routing still works');
      assert.equal((await get(port, '/api/summary')).status, 401, 'API authentication still required');
    } finally {
      for (const server of servers) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      if (oldOffset === undefined) delete process.env.LARP_APPS_PORT_OFFSET;
      else process.env.LARP_APPS_PORT_OFFSET = oldOffset;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
