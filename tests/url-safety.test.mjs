import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checkPublicUrl, isOpenableLink } = require('../src/agent/url-safety.js');

test('public web addresses are allowed', () => {
  assert.equal(checkPublicUrl('https://www.snowflake.com/en/').hostname, 'www.snowflake.com');
  assert.equal(checkPublicUrl('http://8.8.8.8/').hostname, '8.8.8.8');
});

for (const bad of [
  'http://localhost:9333/json', 'http://127.0.0.1/', 'http://10.0.0.1/', 'http://192.168.1.1/',
  'http://172.16.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://[fd00::1]/',
  'http://printer/', 'http://nas.local/', 'file:///etc/passwd', 'javascript:alert(1)',
  'https://user:pw@example.com/', 'not a url', `https://example.com/?q=${'x'.repeat(400)}`,
]) {
  test(`refuses ${bad.slice(0, 40)}`, () => assert.throws(() => checkPublicUrl(bad)));
}

test('only web links open in the browser', () => {
  assert.equal(isOpenableLink('https://example.com/a'), true);
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'about:srcdoc', 'x-apple.systempreferences:', 'nope']) {
    assert.equal(isOpenableLink(bad), false);
  }
});
