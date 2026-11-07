import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const serve = readFileSync(new URL('../tools/serve.py', import.meta.url), 'utf8');

test('npm start runs tools/serve.py', () => {
  const json = JSON.parse(pkg);
  assert.match(json.scripts.start, /tools\/serve\.py/);
});

test('serve.py binds all IPv4 interfaces and prints localhost plus a phone URL', () => {
  assert.match(serve, /0\.0\.0\.0/);
  assert.match(serve, /localhost/);
  assert.match(serve, /Phone:/);
});

test('serve.py forbids caching so a dev reload never mixes old and new modules', () => {
  assert.match(serve, /Cache-Control",\s*"no-store"/);
  assert.match(serve, /NoStoreHandler/);
  assert.ok(!/ReuseTCPServer\(\(HOST, PORT\), http\.server\.SimpleHTTPRequestHandler\)/.test(serve), 'the server must use the no-store handler');
});
