// transcriber.js: turn labelled audio streams into a live transcript. Adapted from
// vibeconf-app's AudioTranscription, without the call provider around it.
//
// Pure: no electron requires. Audio is pushed in, 'turn' and 'remove' come out.
const { EventEmitter } = require('node:events');
const { SpeechGate } = require('./speech-gate.js');

class Transcriber extends EventEmitter {
  /**
   * @param {object} io
   * @param {{transcribe: Function}} io.engine
   * @param {Record<string, string>} io.speakers  stream name -> speaker label
   * @param {Function} [io.gateFactory]  (callbacks) => SpeechGate; for tests
   * @param {Function} [io.log]
   */
  constructor({ engine, speakers, gateFactory = (cb) => new SpeechGate(cb), log = () => {} }) {
    super();
    this._engine = engine;
    this._speakers = speakers;
    this._gateFactory = gateFactory;
    this._log = log;
    this._streams = new Map();
    this._nextTurnId = 1;
    this._running = false;
  }

  start() {
    this._streams.clear();
    this._running = true;
  }

  /** Close whatever is open. Resolves once every last final has landed. */
  async stop() {
    if (!this._running) return;
    this._running = false;
    const open = [...this._streams.values()];
    this._streams.clear();
    for (const st of open) st.gate.flush();
    await Promise.all(open.map((st) => st.chain));
  }

  push(stream, pcm, at) {
    if (!this._running || !(stream in this._speakers)) return;
    let st = this._streams.get(stream);
    if (!st) {
      st = { chain: Promise.resolve(), turn: null, ticket: 0 };
      st.gate = this._gateFactory({
        onPartial: (seg) => this._segment(stream, st, seg, false),
        onFinal: (seg) => this._segment(stream, st, seg, true),
      });
      this._streams.set(stream, st);
    }
    st.gate.push(pcm, at);
  }

  // One transcription at a time per stream, in order, so a slow partial can never
  // land after its own segment's final text. A partial still queued when a newer
  // request arrives is skipped: only the latest view of an open segment matters.
  _segment(stream, st, seg, final) {
    if (!st.turn) {
      st.turn = { turnId: this._nextTurnId++, speaker: this._speakers[stream], text: '', final: false, startAt: seg.startAt, shown: false };
    }
    const turn = st.turn;
    if (final) st.turn = null;
    const ticket = ++st.ticket;
    st.chain = st.chain.then(async () => {
      if (!final && ticket !== st.ticket) return;
      let result;
      try {
        result = await this._engine.transcribe(seg.audio, { language: 'en' });
      } catch (err) {
        this._log(`[stt] ${stream} failed: ${err.message}`);
        return;
      }
      // Timings only. The words themselves never reach the log.
      if (final) this._log(`[stt] ${stream}: ${(seg.audio.length / 16000).toFixed(1)}s, engine ${result.ms} ms, ready ${Date.now() - seg.endAt} ms after speech`);
      if (!result.text) {
        if (final && turn.shown) this.emit('remove', { turnId: turn.turnId });
        return;
      }
      turn.text = result.text;
      turn.final = final;
      turn.shown = true;
      const { turnId, speaker, text, startAt } = turn;
      this.emit('turn', { turnId, speaker, text, final, startAt });
    });
  }
}

module.exports = { Transcriber };
