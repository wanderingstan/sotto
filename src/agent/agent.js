// agent.js: run an interactive Claude Code in a terminal the user can talk to, locked
// down. What it hears comes from whoever is on the call, so it gets the board tools and
// web search and nothing else: no files, no shell, and none of the user's own MCP
// servers, hooks or memory.
const { execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pty = require('node-pty');

// Environment variables that identify a parent Claude session, which leak in when the
// app is started from inside one. From vibeconf-app's agent-spawn.js.
const PARENT_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
];

// Sent once its tools have connected. Started with this as a prompt, its first turn ran
// before they had, and it stopped to say so.
const BEGIN_TEXT = 'The call has started. Begin.';

const MCP_TOOLS = ['next_transcript', 'set_section', 'remove_section', 'fetch_image', 'show_website', 'new_board'].map((t) => `mcp__Sotto__${t}`);
const BUILT_IN_TOOLS = ['WebSearch'];

function buildArgs({ prompt, mcpConfigPath, model = 'opus' }) {
  return [
    '--system-prompt', prompt,
    '--model', model,
    '--mcp-config', mcpConfigPath,
    '--strict-mcp-config',
    '--tools', BUILT_IN_TOOLS.join(','),
    '--allowedTools', [...BUILT_IN_TOOLS, ...MCP_TOOLS].join(','),
    '--permission-mode', 'dontAsk',
    '--setting-sources', '',
    '--settings', JSON.stringify({ spinnerTipsEnabled: false }),
    '--disable-slash-commands',
  ];
}

function agentEnv(env) {
  const out = { ...env };
  for (const k of PARENT_SESSION_VARS) delete out[k];
  delete out.ELECTRON_RUN_AS_NODE;
  out.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1';
  out.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  // next_transcript blocks for as long as the call is quiet.
  out.MCP_TOOL_TIMEOUT = String(60 * 60 * 1000);
  out.TERM = 'xterm-256color';
  // No promos, tips or update checks in a pane someone is glancing at mid-call.
  out.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  // Its suggested next prompt looks like something the user typed.
  out.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION = 'false';
  return out;
}

// A GUI-launched app gets a minimal PATH, so check where installers put it first.
function findClaude() {
  const home = os.homedir();
  const windows = process.platform === 'win32';
  const known = windows
    ? [path.join(home, '.local', 'bin', 'claude.exe')]
    : [path.join(home, '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  const hit = known.find((p) => fs.existsSync(p));
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const [cmd, args] = windows
      ? ['where.exe', ['claude']]
      : [process.env.SHELL || '/bin/zsh', ['-lc', 'command -v claude']];
    execFile(cmd, args, (err, stdout) => {
      const found = err ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // A Windows npm install gives a .cmd shim, which can't be run directly.
      resolve((windows ? found.find((l) => /\.exe$/i.test(l)) : found[0]) || null);
    });
  });
}

class Agent extends EventEmitter {
  /** Emits 'state' { state, detail? }, 'data' (terminal output) and 'exit'. */
  constructor({ workDir, api, prompt, cols, rows, log = () => {} }) {
    super();
    this._workDir = workDir;
    this._api = api;
    this._prompt = prompt;
    this._cols = cols;
    this._rows = rows;
    this._log = log;
    this._pty = null;
    this._killed = false;
  }

  async start() {
    const claude = await findClaude();
    if (!claude) {
      this.emit('state', { state: 'failed', detail: 'Claude Code isn’t installed, so there’s no board. The transcript still works.' });
      return;
    }
    fs.mkdirSync(this._workDir, { recursive: true });
    const mcpConfigPath = path.join(this._workDir, 'mcp.json');
    fs.writeFileSync(mcpConfigPath, JSON.stringify({
      mcpServers: {
        Sotto: {
          command: process.execPath,
          args: [path.join(__dirname, 'mcp-server.js')],
          env: { ELECTRON_RUN_AS_NODE: '1', SOTTO_API_URL: this._api.url, SOTTO_API_TOKEN: this._api.token },
        },
      },
    }), { mode: 0o600 });

    this.emit('state', { state: 'starting' });
    // Terminal output carries the call's words, so it goes to the window and not the log.
    try {
      this._pty = pty.spawn(claude, buildArgs({ prompt: this._prompt, mcpConfigPath }), {
        name: 'xterm-256color',
        cols: this._cols,
        rows: this._rows,
        cwd: this._workDir,
        env: agentEnv(process.env),
      });
    } catch (err) {
      this._log(`[agent] spawn failed: ${err.message}`);
      this.emit('state', { state: 'failed', detail: 'Claude couldn’t start, so there’s no board. The transcript still works.' });
      return;
    }
    this._pty.onData((data) => this.emit('data', data));
    this._pty.onExit(({ exitCode, signal }) => {
      this._pty = null;
      this._log(`[agent] exit code=${exitCode} signal=${signal}`);
      // Ended by us for a new session, which is already reporting its own state.
      if (this._killed) { this.emit('exit'); return; }
      this.emit('state', exitCode && !signal
        ? { state: 'failed', detail: 'Claude stopped unexpectedly. Its last output is in the terminal.' }
        : { state: 'off' });
      this.emit('exit');
    });
  }

  write(data) { if (this._pty) this._pty.write(data); }

  /** Type a message and send it. Apart, or the TUI reads the Enter as part of pasted text. */
  say(text) {
    this.write(text);
    setTimeout(() => this.write('\r'), 300);
  }

  begin() { this.say(BEGIN_TEXT); }

  resize(cols, rows) {
    this._cols = cols;
    this._rows = rows;
    if (this._pty) this._pty.resize(cols, rows);
  }

  kill() {
    this._killed = true;
    if (this._pty) this._pty.kill();
  }
}

module.exports = { Agent, buildArgs, agentEnv, findClaude };
