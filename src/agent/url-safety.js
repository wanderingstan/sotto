// url-safety.js: what the agent may point the app at. Pure: no electron requires.
//
// Fetching a URL tells that server the URL, so an instruction spoken on the call could
// try to carry its words out in one. The length limit keeps that small, and the private
// range check keeps it off this machine and the user's network.
const MAX_URL_LENGTH = 300;

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !host.includes(':')) return true;
  if (host.includes(':')) return host === '::1' || host === '::' || /^(fc|fd|fe[89ab])/.test(host) || host.startsWith('::ffff:');
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** The parsed URL if it's fine to load, otherwise throws with a reason. */
function checkPublicUrl(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) throw new Error(`URL must be under ${MAX_URL_LENGTH} characters`);
  let url;
  try { url = new URL(raw); } catch { throw new Error('not a valid URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http and https URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed');
  if (isPrivateHost(url.hostname)) throw new Error('private and local addresses are not allowed');
  return url;
}

/** A link the user clicked: their browser, their choice, so only the scheme matters. */
function isOpenableLink(raw) {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = { checkPublicUrl, isPrivateHost, isOpenableLink };
