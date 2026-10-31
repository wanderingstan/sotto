// turn-feed.js: decides when the agent should wake. It waits for enough new words,
// or a pause after a smaller amount, so it isn't woken by every phrase or by a
// phantom "Thank you." from the speech engine. Words said while the agent is busy
// wait here and arrive together on its next call. Pure: no electron requires.
class TurnFeed {
  constructor({ wordsToWake = 40, minWords = 8, quietMs = 6000, pollMs = 250, now = Date.now } = {}) {
    this._wordsToWake = wordsToWake;
    this._minWords = minWords;
    this._quietMs = quietMs;
    this._pollMs = pollMs;
    this._now = now;
    this._pending = [];
    this._words = 0;
    this._lastAt = 0;
    this._ended = false;
    this._waiter = null;
  }

  add(turn) {
    this._pending.push(turn);
    this._words += countWords(turn.text);
    this._lastAt = this._now();
    this._check();
  }

  end() {
    this._ended = true;
    this._check();
  }

  /** Return from a blocked next() now, so the agent can see a message the user just sent. */
  wake() {
    if (this._waiter) this._settle(true);
  }

  /** The waiting call went away. Keep what's pending for the next one. */
  cancel() {
    if (this._waiter) this._settle(false);
  }

  /** Resolves { turns, ended }. Turns are empty if maxWaitMs passes with nothing to say. */
  next(maxWaitMs) {
    if (this._waiter) this._settle(false);
    return new Promise((resolve) => {
      this._waiter = {
        resolve,
        deadline: this._now() + maxWaitMs,
        timer: setInterval(() => this._check(), this._pollMs).unref(),
      };
      this._check();
    });
  }

  _check() {
    const w = this._waiter;
    if (!w) return;
    const enough = this._words >= this._wordsToWake
      || (this._words >= this._minWords && this._now() - this._lastAt >= this._quietMs);
    if (this._ended || enough) this._settle(true);
    else if (this._now() >= w.deadline) this._settle(false);
  }

  _settle(deliver) {
    const w = this._waiter;
    this._waiter = null;
    clearInterval(w.timer);
    const turns = deliver ? this._pending : [];
    if (deliver) { this._pending = []; this._words = 0; }
    w.resolve({ turns, ended: this._ended });
  }
}

function countWords(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

// What the agent reads. Angle brackets are stripped because this text comes from
// whoever is on the call, and it must not be able to close the wrapper around it.
function formatTurns({ turns, ended }) {
  const lines = turns
    .slice()
    .sort((a, b) => a.startAt - b.startAt)
    .map((t) => `${t.speaker}: ${String(t.text).replace(/[<>]/g, '')}`);
  const body = lines.length
    ? `<call-transcript>\n${lines.join('\n')}\n</call-transcript>`
    : 'Nothing new was said.';
  return ended ? `${body}\n\nThe call has ended. Tidy the board once, then finish.` : body;
}

// Whether the agent has dropped out of its loop and should be told to resume. It can
// end its turn early: when its tools hadn't connected yet, or after being interrupted.
// It's only safe to type for it when it isn't waiting and the user isn't mid-sentence.
function shouldNudge({ now, waiting, ended, lastCallAt, lastKeyAt, idleMs = 30000, typingMs = 10000 }) {
  return !waiting && !ended && now - lastCallAt >= idleMs && now - lastKeyAt >= typingMs;
}

module.exports = { TurnFeed, formatTurns, countWords, shouldNudge };
