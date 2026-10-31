// local-api.js: how the MCP server reaches the app. Loopback only, with a token
// fresh for each session, because this serves the words of a private call and any
// web page in a browser can send requests to localhost.
const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');

const MAX_BODY = 1024 * 1024;

function startLocalApi(routes) {
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);

  const server = http.createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const given = Buffer.from(req.headers.authorization || '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reply(401, { error: 'unauthorized' });
    const route = req.method === 'POST' && routes[req.url];
    if (!route) return reply(404, { error: 'not found' });

    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reply(413, { error: 'too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      try {
        reply(200, await route(JSON.parse(Buffer.concat(chunks).toString() || '{}'), res));
      } catch (err) {
        reply(400, { error: err.message });
      }
    });
    return undefined;
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, token, close: () => server.close() });
    });
  });
}

module.exports = { startLocalApi };
