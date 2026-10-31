// image-fetch.js: the app fetches images for the board, so the board itself never makes
// a network request. A web page's address works too: its preview image is used, and none
// of the page's text reaches the agent.
const dns = require('node:dns/promises');
const { checkPublicUrl, isPrivateHost } = require('./url-safety.js');

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10000;
const USER_AGENT = 'Sotto/0.0 (notes app; image preview)';

/** The page's og:image or twitter:image, resolved against the page, or null. */
function previewImageUrl(html, pageUrl) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/(?:property|name)\s*=\s*["'](?:og:image(?::url)?|twitter:image)["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (content) {
      try { return new URL(content[1].replace(/&amp;/g, '&'), pageUrl).href; } catch { /* try the next tag */ }
    }
  }
  return null;
}

async function checkResolves(url, lookup) {
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some((a) => isPrivateHost(a.address))) throw new Error('private and local addresses are not allowed');
}

async function get(raw, { fetchImpl, lookup }) {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = checkPublicUrl(current);
    await checkResolves(url, lookup);
    const res = await fetchImpl(url.href, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), url).href;
      continue;
    }
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    return { res, url };
  }
  throw new Error('too many redirects');
}

async function readLimited(res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Resolves a data: URI for the image at `raw`, or at the preview image of the page there. */
async function fetchImage(raw, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  const io = { fetchImpl, lookup };
  let { res, url } = await get(raw, io);
  if (/^text\/html|xhtml/i.test(res.headers.get('content-type') || '')) {
    const preview = previewImageUrl((await readLimited(res)).toString('utf8'), url);
    if (!preview) throw new Error('that page has no preview image');
    ({ res, url } = await get(preview, io));
  }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`that isn't an image (${type || 'unknown type'})`);
  return `data:${type};base64,${(await readLimited(res)).toString('base64')}`;
}

module.exports = { fetchImage, previewImageUrl };
