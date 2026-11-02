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
