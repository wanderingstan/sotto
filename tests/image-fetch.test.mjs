import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchImage, previewImageUrl } = require('../src/agent/image-fetch.js');

const publicDns = async () => [{ address: '93.184.216.34' }];
const reply = (body, type, status = 200, location = null) => new Response(status >= 300 && status < 400 ? null : body, {
  status,
  headers: { ...(type ? { 'content-type': type } : {}), ...(location ? { location } : {}) },
});
const server = (routes) => async (url) => routes[url]();

test('an image comes back as a data URI', async () => {
  const fetchImpl = server({ 'https://a.com/x.png': () => reply('hi', 'image/png') });
  assert.equal(await fetchImage('https://a.com/x.png', { fetchImpl, lookup: publicDns }), `data:image/png;base64,${Buffer.from('hi').toString('base64')}`);
});

test('a page gives its preview image', async () => {
  const fetchImpl = server({
    'https://a.com/': () => reply('<meta content="/og.jpg" property="og:image">', 'text/html; charset=utf-8'),
    'https://a.com/og.jpg': () => reply('jpg', 'image/jpeg'),
  });
  assert.match(await fetchImage('https://a.com/', { fetchImpl, lookup: publicDns }), /^data:image\/jpeg/);
});

test('a page with no preview image fails', async () => {
  const fetchImpl = server({ 'https://a.com/': () => reply('<title>x</title>', 'text/html') });
  await assert.rejects(fetchImage('https://a.com/', { fetchImpl, lookup: publicDns }), /no preview/);
});

test('anything else is refused', async () => {
  const fetchImpl = server({ 'https://a.com/x': () => reply('{}', 'application/json') });
  await assert.rejects(fetchImage('https://a.com/x', { fetchImpl, lookup: publicDns }), /isn't an image/);
});

test('a redirect to a private address is refused', async () => {
  const fetchImpl = server({ 'https://a.com/x': () => reply(null, null, 302, 'http://127.0.0.1/secret') });
  await assert.rejects(fetchImage('https://a.com/x', { fetchImpl, lookup: publicDns }), /private/);
});

test('a public name resolving to a private address is refused', async () => {
  const lookup = async () => [{ address: '192.168.1.5' }];
  await assert.rejects(fetchImage('https://a.com/x', { fetchImpl: () => { throw new Error('fetched'); }, lookup }), /private/);
});

test('oversized images are refused', async () => {
  const fetchImpl = server({ 'https://a.com/x': () => reply(new Uint8Array(9 * 1024 * 1024), 'image/png') });
  await assert.rejects(fetchImage('https://a.com/x', { fetchImpl, lookup: publicDns }), /too large/);
});

test('preview tags work in either attribute order, and bad ones are skipped', () => {
  assert.equal(previewImageUrl('<meta property="og:image" content="https://b.com/i.png">', 'https://a.com'), 'https://b.com/i.png');
  assert.equal(previewImageUrl('<meta name="twitter:image" content="/i.png">', 'https://a.com/p'), 'https://a.com/i.png');
  assert.equal(previewImageUrl('<meta name="description" content="/i.png">', 'https://a.com'), null);
});
