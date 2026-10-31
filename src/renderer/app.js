// app.js: the start/stop control, the live transcript and the assistant's status.
const $ = (id) => document.getElementById(id);
const els = {
  toggle: $('toggle'), status: $('status'), alert: $('alert'), notice: $('notice'),
  transcript: $('transcript'), empty: $('empty'), mic: $('mic'), system: $('system'), agent: $('agent'),
};

const PROBLEMS = window.sotto.platform === 'darwin' ? {
  mic: 'Sotto can’t hear your microphone. Allow it in System Settings → Privacy & Security → Microphone.',
  system: 'Sotto can’t hear the call. Allow it in System Settings → Privacy & Security → Screen & System Audio Recording, under System Audio Recording Only, then start again.',
} : {
  mic: 'Sotto can’t hear your microphone. Check that one is connected and allowed in your system’s privacy settings.',
  system: 'Sotto can’t hear the call’s audio.',
};

let running = false;
let busy = false;
let engineReady = false;
const rows = new Map();

function render() {
  els.toggle.textContent = running ? 'Stop listening' : 'Start listening';
  els.toggle.classList.toggle('running', running);
  els.toggle.disabled = busy || !engineReady;
  document.body.classList.toggle('listening', running);
  els.status.textContent = running ? 'Listening' : (engineReady ? 'Not listening' : els.status.textContent);
}

function setAlert(text) {
  els.alert.textContent = text || '';
  els.alert.hidden = !text;
}

function onChunk(name, pcm) {
  window.sotto.sendAudio(name, pcm, Date.now());
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  els[name].style.width = `${Math.min(100, Math.sqrt(sum / pcm.length) * 300)}%`;
}

function onEnded(name) {
  window.sotto.status(`${name}: track ended`);
  setAlert(PROBLEMS[name]);
  els[name].style.width = '0';
}

async function start() {
  busy = true;
  setAlert('');
  rows.clear();
  els.transcript.replaceChildren(els.empty);
  window.board.clear();
  window.sitePane.reset();
  render();
  const { microphone } = await window.sotto.startSession(window.claudeTerminal.start());
  const handlers = { onChunk, onEnded };
  const problems = [];
  try {
    if (!microphone) throw new Error('microphone permission denied');
    await window.capture.startMic(handlers);
  } catch (err) {
    window.sotto.status(`mic failed: ${err.name}: ${err.message}`);
    problems.push(PROBLEMS.mic);
  }
  try {
    await window.capture.startSystem(handlers);
  } catch (err) {
    window.sotto.status(`system failed: ${err.name}: ${err.message}`);
    problems.push(PROBLEMS.system);
  }
  if (problems.length) setAlert(problems.join(' '));
  running = true;
  busy = false;
  render();
}

async function stop() {
  busy = true;
  running = false;
  render();
  window.capture.stop();
  await window.sotto.stopSession();
  els.mic.style.width = '0';
  els.system.style.width = '0';
  busy = false;
  render();
}

els.toggle.addEventListener('click', () => (running ? stop() : start()));

// The mic hears speakers, so without a headset the other side lands under "You".
async function checkHeadset() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const output = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === 'default');
  els.notice.hidden = !(output && /speaker/i.test(output.label));
}
navigator.mediaDevices.addEventListener('devicechange', checkHeadset);

function isPinned() {
  const el = els.transcript;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

window.sotto.onTurn((turn) => {
  const pinned = isPinned();
  let row = rows.get(turn.turnId);
  if (!row) {
    row = document.createElement('div');
    row.className = `turn ${turn.speaker === 'You' ? 'you' : 'them'}`;
    row.dataset.startAt = turn.startAt;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = turn.speaker;
    const text = document.createElement('div');
    text.className = 'text';
    row.append(who, text);
    rows.set(turn.turnId, row);
    els.empty.remove();
    // Streams finish out of order, so keep rows in the order people spoke.
    const next = [...els.transcript.children].find((r) => Number(r.dataset.startAt) > turn.startAt);
    els.transcript.insertBefore(row, next || null);
  }
  row.querySelector('.text').textContent = turn.text;
  row.classList.toggle('partial', !turn.final);
  if (pinned) els.transcript.scrollTop = els.transcript.scrollHeight;
});

window.sotto.onTurnRemoved(({ turnId }) => {
  const row = rows.get(turnId);
  if (row) row.remove();
  rows.delete(turnId);
});

window.sotto.onEngine(({ state, detail }) => {
  engineReady = state === 'ready';
  if (state === 'loading') els.status.textContent = 'Preparing speech model…';
  if (state === 'failed') {
    els.status.textContent = 'Speech model unavailable';
    setAlert(`The speech model couldn’t load: ${detail}`);
  }
  render();
});

const AGENT_LABELS = {
  starting: 'Claude starting…',
  watching: 'Claude following along',
  working: 'Claude working…',
  ended: 'Call ended. You can keep asking Claude.',
  off: '',
};

window.sotto.onAgent(({ state, detail }) => {
  els.agent.textContent = state === 'failed' ? 'Claude stopped' : AGENT_LABELS[state] ?? '';
  if (state === 'failed') setAlert(detail);
});

window.sotto.onBoardSection(({ name, html }) => window.board.setSection(name, html));
window.sotto.onBoardNew(({ title }) => window.board.newPage(title));
window.sotto.onBoardRemove(({ name }) => window.board.removeSection(name));

checkHeadset();
render();
