import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { sha256, hmacSha256 } from '../src/sha256.js';
import { exportCode, importCode } from '../src/save.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const utf8 = (s) => new TextEncoder().encode(s);
const storage = () => ({ getItem: () => null, setItem() {} });

test('sha256 matches the FIPS 180-2 examples and Node\'s own hash at every padding boundary', () => {
  assert.equal(hex(sha256(utf8(''))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(sha256(utf8('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
    const bytes = randomBytes(n);
    assert.equal(hex(sha256(new Uint8Array(bytes))), createHash('sha256').update(bytes).digest('hex'), `${n} bytes`);
  }
});

test('hmacSha256 matches RFC 4231 cases 1, 2, 3 and 6 (a key longer than the block)', () => {
  const cases = [
    [new Uint8Array(20).fill(0x0b), utf8('Hi There'), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'],
    [utf8('Jefe'), utf8('what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
    [new Uint8Array(20).fill(0xaa), new Uint8Array(50).fill(0xdd), '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'],
    [new Uint8Array(131).fill(0xaa), utf8('Test Using Larger Than Block-Size Key - Hash Key First'), '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'],
  ];
  for (const [key, data, want] of cases) assert.equal(hex(hmacSha256(key, data)), want);
});

test('hmacSha256 agrees with Node\'s HMAC on 200 random keys and messages', () => {
  for (let i = 0; i < 200; i += 1) {
    const key = randomBytes(1 + (i % 150));
    const msg = randomBytes(i * 3);
    assert.equal(hex(hmacSha256(new Uint8Array(key), new Uint8Array(msg))), createHmac('sha256', key).update(msg).digest('hex'), `case ${i}`);
  }
});

test('without crypto.subtle (a plain-http page) user codes still sign and load, and cross over with Web Crypto codes', async () => {
  const state = { id: 'AAAAAAAAAAAAAAAAAAAAAA', name: 'Plain', top: [{ score: 41, toilet: true, level: 3 }, { score: 12, toilet: false, level: 1 }], exportedAt: null };
  const withSubtle = await exportCode(state, { now: () => 1794232177 });
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const real = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a) => real.getRandomValues(a) }, configurable: true, writable: true });
  try {
    assert.equal(globalThis.crypto.subtle, undefined, 'subtle hidden');
    const plain = await exportCode(state, { now: () => 1794232177 });
    assert.equal(plain, withSubtle, 'the fallback signs a code byte for byte like Web Crypto');
    const res = await importCode(withSubtle, { storage: storage() });
    assert.equal(res.ok, true, 'a Web Crypto code loads without Web Crypto');
    assert.equal(res.state.name, 'Plain');
    const bad = await importCode(withSubtle.slice(0, -2) + (withSubtle.endsWith('AA') ? 'AB' : 'AA'), { storage: storage() });
    assert.equal(bad.ok, false, 'an edited signature is still refused');
  } finally {
    if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    else globalThis.crypto = real;
  }
  assert.ok(globalThis.crypto.subtle, 'Web Crypto restored');
});
