// main.js: hear mic and system audio as separate streams, transcribe each on-device,
// show a labelled live transcript, and have a silent local Claude keep a private board
// from it, in a terminal the user can talk to it through. "You" is the mic; "Them" is everything the computer plays. A headset is
// required, or the mic hears the other side too.
//
// The transcript and board live only in the window. Nothing the call says is written
// to disk by this app; the log holds timings and errors. Two things it doesn't control:
// the words go to Anthropic while the call runs, and interactive Claude Code keeps its
// own session log under ~/.claude/projects, which will contain them.
const { app, BrowserWindow, ipcMain, session, shell, systemPreferences } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { WhistleEngine } = require('./hearing/stt-whistle.js');
const { Transcriber } = require('./hearing/transcriber.js');
const { Agent } = require('./agent/agent.js');
const { Board } = require('./agent/board.js');
const { startLocalApi } = require('./agent/local-api.js');
const { Instructions } = require('./agent/instructions.js');
const { fetchImage } = require('./agent/image-fetch.js');
const { SitePane } = require('./site-pane.js');
const { isOpenableLink } = require('./agent/url-safety.js');
const { TurnFeed, formatTurns, shouldNudge } = require('./agent/turn-feed.js');

const SPEAKERS = { mic: 'You', system: 'Them' };
// How long a quiet call can block next_transcript before the agent gets an empty answer.
// Under Claude Code's 120 s limit, past which it moves a tool call to the background.
const MAX_QUIET_MS = 100 * 1000;
// Let Claude Code queue the message before the blocked tool returns, or it misses it.
const WAKE_DELAY_MS = 200;

if (!app.requestSingleInstanceLock()) app.quit();

const logPath = path.join(app.getPath('logs'), 'sotto.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

let win = null;
const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function log(line) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const engine = new WhistleEngine({
  root: path.join(app.getPath('userData'), 'whistle'),
  log: (line) => { log(line); send('engine', { state: 'loading', detail: line }); },
});

const transcriber = new Transcriber({ engine, speakers: SPEAKERS, log });
transcriber.on('turn', (turn) => {
  send('turn', turn);
  if (turn.final && feed) feed.add(turn);
});
transcriber.on('remove', (msg) => send('turn-removed', msg));

const board = new Board();
let instructions = null;
let feed = null;
let agent = null;
let api = null;
let site = null;
let waiting = false;
let ended = false;
let lastCallAt = 0;
let lastKeyAt = 0;
let nudgeTimer = null;

const NUDGE_TEXT = 'Keep following the call: call next_transcript.';

function nudgeIfIdle() {
  const now = Date.now();
  if (!agent || !shouldNudge({ now, waiting, ended, lastCallAt, lastKeyAt })) return;
  log('[agent] nudged back into its loop');
  lastCallAt = now;
  agent.write(NUDGE_TEXT);
  // Sent apart, or the TUI reads the Enter as part of pasted text.
  setTimeout(() => { if (agent) agent.write('\r'); }, 300);
}

function sendAgent(state, detail) {
  log(`[agent] ${state}`);
  send('agent', { state, detail });
}

async function startAgent({ cols, rows }) {
  feed = new TurnFeed();
  const sessionFeed = feed;
  board.clear();
  site.close();
  waiting = false;
  ended = false;
  lastCallAt = Date.now();
  clearInterval(nudgeTimer);
  nudgeTimer = setInterval(nudgeIfIdle, 5000);
  api = await startLocalApi({
    '/next': async (_body, res) => {
      sendAgent('watching');
      waiting = true;
      const closed = () => sessionFeed.cancel();
      res.once('close', closed);
      const result = await sessionFeed.next(MAX_QUIET_MS);
      res.removeListener('close', closed);
      waiting = false;
      lastCallAt = Date.now();
      sendAgent(result.ended ? 'ended' : 'working');
      return { text: formatTurns(result) };
    },
    '/section': async ({ name, html }) => {
      lastCallAt = Date.now();
      send('board-section', { name: name.trim(), html: board.set(name, html) });
      return {};
    },
    '/image': async ({ url }) => {
      lastCallAt = Date.now();
      const id = board.addImage(await fetchImage(url));
      return { text: `Ready. Use <img src="${id}" alt="..."> in set_section.` };
    },
    '/website': async ({ url }) => {
      lastCallAt = Date.now();
      site.show(url);
      send('site-shown', { url });
      return { text: 'Opened in the website tab.' };
    },
    '/new-board': async ({ title }) => {
      lastCallAt = Date.now();
      send('board-new', { title: board.newPage(title) });
      return {};
    },
    '/remove': async ({ name }) => {
      if (board.remove(name)) send('board-remove', { name: String(name).trim() });
      return {};
    },
  });
  const sessionApi = api;
  agent = new Agent({ workDir: path.join(app.getPath('userData'), 'agent'), api: sessionApi, prompt: instructions.prompt(), cols, rows, log });
  agent.on('state', ({ state, detail }) => sendAgent(state, detail));
  agent.on('data', (data) => send('term-data', data));
  agent.on('exit', () => sessionApi.close());
  await agent.start();
}

ipcMain.handle('session:start', async (_e, size) => {
  const microphone = await systemPreferences.askForMediaAccess('microphone');
  log(`[session] start, microphone=${microphone}`);
  if (agent) agent.kill();
  transcriber.start();
  await startAgent(size);
  return { microphone };
});
ipcMain.handle('session:stop', async () => {
  log('[session] stop');
  // Finals land before the feed ends, so the agent hears the last thing said.
  await transcriber.stop();
  ended = true;
  feed.end();
});
ipcMain.on('term-input', (_e, data) => {
  if (!agent) return;
  lastKeyAt = Date.now();
  agent.write(data);
  // Enter sends a message, but the agent may be blocked waiting for the call to speak.
  if (data.includes('\r')) setTimeout(() => { if (feed) feed.wake(); }, WAKE_DELAY_MS);
});
// A click in the board, or the website tab's button. It's the user's own browser and the
// user's own click, so the only thing to rule out is schemes that aren't web pages.
ipcMain.on('open-link', (_e, url) => {
  if (!isOpenableLink(url)) { log('[board] refused to open a link'); return; }
  log('[board] opened a link');
  shell.openExternal(url);
});
ipcMain.handle('instructions:get', () => instructions.get());
ipcMain.handle('instructions:set', (_e, text) => instructions.set(text));
ipcMain.handle('instructions:reset', () => instructions.reset());
ipcMain.on('instructions:open', () => { shell.openPath(instructions.get().file); });
ipcMain.on('site-layout', (_e, layout) => { if (site) site.layout(layout); });
ipcMain.on('site-close', () => { if (site) site.close(); });
ipcMain.on('term-resize', (_e, { cols, rows }) => { if (agent) agent.resize(cols, rows); });
ipcMain.on('audio', (_e, { stream, pcm, at }) => transcriber.push(stream, pcm, at));
ipcMain.on('status', (_e, line) => log(`[capture] ${line}`));

app.on('before-quit', () => { if (agent) agent.kill(); });

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  instructions = new Instructions(path.join(app.getPath('userData'), 'instructions.md'));
  log(`--- start: Electron ${process.versions.electron}, macOS ${process.getSystemVersion()}, packaged=${app.isPackaged}`);

  // Chromium insists on a video source even though we only keep the audio. Our own
  // frame satisfies it without listing screens, so we never need the Screen Recording
  // permission: system audio still flows with it denied (macOS 26.5, Electron 45.2).
  session.defaultSession.setDisplayMediaRequestHandler((req, callback) => {
    callback({ video: req.frame, audio: 'loopback' });
  });

  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 320,
    title: 'Sotto',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  // The board shows agent-written HTML. Nothing in this window may leave it: a page
  // that navigated to a remote URL could carry the call's words out in that URL.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-frame-navigate', (e) => {
    if (e.url !== 'about:srcdoc' && !e.url.startsWith('file://')) {
      log('[board] blocked a navigation');
      e.preventDefault();
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  site = new SitePane({ win, log, onUrl: (url) => send('site-url', { url }), onFail: (detail) => send('site-failed', { detail }) });
  win.webContents.once('did-finish-load', () => {
    engine.ready().then(
      () => send('engine', { state: 'ready' }),
      (err) => { log(`[stt] engine failed to load: ${err.message}`); send('engine', { state: 'failed', detail: err.message }); },
    );
  });
});

app.on('window-all-closed', () => app.quit());
