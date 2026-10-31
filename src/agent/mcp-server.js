// mcp-server.js: the agent's only tools. Runs as a child of Claude Code and forwards
// each call to the app's local API.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const { SOTTO_API_URL: API_URL, SOTTO_API_TOKEN: API_TOKEN } = process.env;

async function call(path, body = {}, signal = null) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify(body),
    signal: signal || AbortSignal.timeout(60 * 1000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const server = new McpServer({ name: 'Sotto', version: '0.0.1' });

server.tool(
  'next_transcript',
  'Wait for more of the call. Blocks until enough new words have been said, then returns them. Call it again as soon as your board is up to date.',
  {},
  // Passing the signal lets the app see an interrupted wait end.
  async (_args, extra) => text((await call('/next', {}, extra.signal)).text),
);

server.tool(
  'set_section',
  'Create or replace one named section of the current board. New sections appear below existing ones. The html is a fragment. Links open in the person\'s browser when clicked. Images must come from fetch_image; scripts do not run.',
  {
    name: z.string().min(1).max(60).describe('Section heading, such as "Notes" or "Terms"'),
    html: z.string().describe('The whole new content of the section'),
  },
  async ({ name, html }) => { await call('/section', { name, html }); return text('Updated.'); },
);

server.tool(
  'remove_section',
  'Remove a section from the board.',
  { name: z.string() },
  async ({ name }) => { await call('/remove', { name }); return text('Removed.'); },
);

server.tool(
  'fetch_image',
  'Get an image ready for the board, from an image address or a web page (its preview image is used). Returns an id to use as <img src="image:1" alt="..."> in set_section.',
  { url: z.string().describe('A public http or https address, with nothing from the call in it') },
  async ({ url }) => text((await call('/image', { url })).text),
);

server.tool(
  'show_website',
  'Open a public web page in the website tab beside the board, and switch the person to it. Use it rarely: it takes over what they are looking at.',
  { url: z.string().describe('A public http or https address, with nothing from the call in it') },
  async ({ url }) => text((await call('/website', { url })).text),
);

server.tool(
  'new_board',
  'Start a fresh board when the conversation moves to a new topic. The current one stays in the history the person can flip back through.',
  { title: z.string().min(1).max(60).describe('Short title for the new board') },
  async ({ title }) => { await call('/new-board', { title }); return text('New board started.'); },
);

server.connect(new StdioServerTransport());
