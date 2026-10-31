// board.js: the board's contents. Pages of ordered, named sections, where only the newest
// page is written to and the older ones are the history the user can flip back through.
// Images are held here so that their bytes never pass through the agent's context.
class Board {
  constructor() { this.clear(); }

  clear() {
    this._pages = [{ title: 'Board', sections: new Set() }];
    this._images = new Map();
    this._nextImage = 1;
  }

  _page() { return this._pages[this._pages.length - 1]; }

  /** Returns the title used. An empty page is renamed rather than kept as a blank. */
  newPage(title) {
    const clean = String(title || '').trim().slice(0, 60);
    if (!clean) throw new Error('a new board needs a title');
    if (this._page().sections.size) this._pages.push({ title: clean, sections: new Set() });
    else this._page().title = clean;
    return clean;
  }

  set(name, html) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('section needs a name');
    if (typeof html !== 'string') throw new Error('section needs html');
    this._page().sections.add(name.trim());
    return this._resolveImages(html);
  }

  remove(name) { return this._page().sections.delete(String(name).trim()); }

  addImage(dataUri) {
    const id = `image:${this._nextImage++}`;
    this._images.set(id, dataUri);
    return id;
  }

  _resolveImages(html) {
    return html.replace(/(\bsrc\s*=\s*["'])(image:\d+)(["'])/gi, (all, open, id, close) => (
      this._images.has(id) ? `${open}${this._images.get(id)}${close}` : all
    ));
  }
}

module.exports = { Board };
