// instructions.js: the part of the agent's prompt that belongs to the user. The rest
// (the loop, the tools, and treating the transcript as data) stays in prompt.md, so that
// editing what goes on the board can't switch off what keeps a call safe.
const fs = require('node:fs');
const path = require('node:path');

const MAX_LENGTH = 50000;
const PLACEHOLDER = '{{INSTRUCTIONS}}';

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const defaultInstructions = () => read('default-instructions.md').trim();

function buildPrompt(core, instructions) {
  return core.replace(PLACEHOLDER, () => instructions);
}

// A plain file the user can edit in any editor, as well as in the app. It's read fresh
// each time, so edits made either way apply the next time listening starts.
class Instructions {
  constructor(file) { this.file = file; }

  /** { text, isDefault, file }. A missing or blank file is filled with the defaults. */
  get() {
    let text = '';
    try { text = fs.readFileSync(this.file, 'utf8').trim(); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (!text) return this.reset();
    return { text, isDefault: text === defaultInstructions(), file: this.file };
  }

  set(text) {
    if (typeof text !== 'string' || text.length > MAX_LENGTH) throw new Error('instructions are too long');
    if (!text.trim()) return this.reset();
    fs.writeFileSync(this.file, `${text.trim()}\n`, { mode: 0o600 });
    return this.get();
  }

  reset() {
    const text = defaultInstructions();
    fs.writeFileSync(this.file, `${text}\n`, { mode: 0o600 });
    return { text, isDefault: true, file: this.file };
  }

  prompt() { return buildPrompt(read('prompt.md'), this.get().text.slice(0, MAX_LENGTH)); }
}

module.exports = { Instructions, buildPrompt, defaultInstructions };
