import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Transcriber } = require('../src/hearing/transcriber.js');

const SPEAKERS = { mic: 'You', system: 'Them' };

// A gate the test drives by hand, and an engine that answers from a script.
function rig(answer) {
  const gates = {};
  const order = [];
  const t = new Transcriber({
    speakers: SPEAKERS,
    engine: { transcribe: async (audio) => ({ text: answer(audio), ms: 1 }) },
    gateFactory: (cb) => {
      const gate = { ...cb, pushed: 0, push() { gate.pushed++; }, flush() { gate.flushed = true; gate.onFinal({ audio: 'flush', startAt: 1, endAt: 2 }); } };
      order.push(gate);
      return gate;
    },
  });
  const turns = [];
  const removed = [];
  t.on('turn', (x) => turns.push(x));
  t.on('remove', (x) => removed.push(x.turnId));
  t.start();
  t.push('mic', [0], 0);
  t.push('system', [0], 0);
  gates.mic = order[0];
  gates.system = order[1];
  return { t, gates, turns, removed };
}

const settle = () => new Promise((r) => setTimeout(r, 5));

test('labels each stream with its own speaker', async () => {
  const { gates, turns } = rig((a) => a);
  gates.mic.onFinal({ audio: 'mine', startAt: 1, endAt: 2 });
  gates.system.onFinal({ audio: 'theirs', startAt: 3, endAt: 4 });
  await settle();
  assert.deepEqual(turns.map((x) => [x.speaker, x.text, x.final]), [['You', 'mine', true], ['Them', 'theirs', true]]);
});

test('a final updates the turn its partial started', async () => {
  const { gates, turns } = rig((a) => a);
  gates.mic.onPartial({ audio: 'hel', startAt: 1 });
  await settle();
  gates.mic.onFinal({ audio: 'hello', startAt: 1, endAt: 2 });
  await settle();
  assert.equal(turns[0].turnId, turns[1].turnId);
  assert.deepEqual(turns.map((x) => [x.text, x.final]), [['hel', false], ['hello', true]]);
});

test('a queued partial is skipped once a final supersedes it', async () => {
  const { gates, turns } = rig((a) => a);
  gates.mic.onPartial({ audio: 'stale', startAt: 1 });
  gates.mic.onFinal({ audio: 'hello', startAt: 1, endAt: 2 });
  await settle();
  assert.deepEqual(turns.map((x) => x.text), ['hello']);
});

test('a shown turn is removed when its final comes back empty', async () => {
  const { gates, turns, removed } = rig((a) => (a === 'noise' ? '' : a));
  gates.mic.onPartial({ audio: 'hm', startAt: 1 });
  await settle();
  gates.mic.onFinal({ audio: 'noise', startAt: 1, endAt: 2 });
  await settle();
  assert.deepEqual(removed, [turns[0].turnId]);
});

test('stop flushes open speech and ignores audio that arrives after', async () => {
  const { t, gates, turns } = rig((a) => a);
  await t.stop();
  assert.equal(gates.mic.flushed, true);
  assert.equal(turns.length, 2);
  const before = gates.mic.pushed;
  t.push('mic', [0], 0);
  assert.equal(gates.mic.pushed, before);
});

test('unknown streams are ignored', () => {
  const { t } = rig((a) => a);
  assert.doesNotThrow(() => t.push('nope', [0], 0));
});
