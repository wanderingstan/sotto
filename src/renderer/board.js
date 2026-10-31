// board.js: fills the sandboxed board frame and keeps its history. The frame's own CSP
// blocks every network request, so agent-written HTML can't carry the call's words out
// through an image. Images reach it as data: URIs that main fetched.
window.board = (() => {
  const $ = (id) => document.getElementById(id);
  const frame = $('board');
  const EMPTY = 'Sotto’s notes appear here while you listen.';
  const NEW_MS = 12000;
  const BLOCKS = 'li, p, dt, dd, tr, svg, img';

  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
:root { --fg: #1a1a1a; --muted: #6b6b6b; --line: #e4e4e4; --bg: #ffffff; --link: #1f6feb; --new: #ececec; }
@media (prefers-color-scheme: dark) { :root { --fg: #ececec; --muted: #9a9a9a; --line: #333333; --bg: #1b1b1b; --link: #6ea8ff; --new: #2a2a2a; } }
html { background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; padding: 16px 24px 32px; }
#empty { color: var(--muted); }
h2 { margin: 20px 0 6px; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
section:first-child h2 { margin-top: 0; }
ul, ol { margin: 0; padding-left: 20px; }
li + li { margin-top: 3px; }
p { margin: 0 0 6px; }
dl { margin: 0; }
dt { font-weight: 600; }
dd { margin: 0 0 6px; color: var(--muted); }
table { border-collapse: collapse; }
th, td { padding: 3px 10px 3px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
svg { display: block; max-width: 100%; height: auto; }
img { display: block; max-width: min(100%, 320px); max-height: 200px; height: auto; margin: 4px 0; border-radius: 4px; }
a { color: var(--link); text-decoration: none; cursor: pointer; }
a:hover { text-decoration: underline; }
.new { animation: new ${NEW_MS}ms ease-in; border-radius: 3px; }
@keyframes new { from, 50% { background-color: var(--new); } to { background-color: transparent; } }
</style></head><body></body></html>`;

  const loaded = new Promise((resolve) => {
    frame.addEventListener('load', () => {
      // Every link goes to the user's browser. The frame itself never navigates.
      frame.contentDocument.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        e.preventDefault();
        window.sotto.openLink(a.href);
      });
      resolve();
    }, { once: true });
  });
  const doc = () => frame.contentDocument;

  let pages;
  let viewing;
  const latest = () => pages.length - 1;

  function fresh() {
    pages = [{ title: 'Board', sections: new Map() }];
    viewing = 0;
  }

  function fill(section, html) {
    section.lastElementChild.innerHTML = html;
    // The address shows on hover, so a link can't hide where it goes.
    section.querySelectorAll('a[href]').forEach((a) => { a.title = a.href; });
  }

  // What a block says, so a rewritten section can be compared with the one it replaces.
  function blockKey(el) {
    if (el.matches('svg')) return el.outerHTML;
    if (el.matches('img')) return el.getAttribute('src');
    return el.textContent.replace(/\s+/g, ' ').trim();
  }

  const blockKeys = (section) => new Set([...section.querySelectorAll(BLOCKS)].map(blockKey));

  // When each block first appeared, per section, so a second update in quick succession
  // doesn't wipe the highlight from the first or restart its fade.
  let firstSeen = new Map();

  // Claude rewrites whole sections, so this works out what actually changed, marks it,
  // and brings the first of it into view.
  function markNew(name, section, before) {
    const now = Date.now();
    const seen = firstSeen.get(name) || new Map();
    let first = null;
    for (const el of section.querySelectorAll(BLOCKS)) {
      const key = blockKey(el);
      if (!key) continue;
      if (!before.has(key) && !seen.has(key)) seen.set(key, now);
      const age = now - (seen.get(key) ?? -Infinity);
      if (age >= NEW_MS) continue;
      el.classList.add('new');
      el.style.animationDelay = `${-age}ms`;
      if (age === 0 && !first) first = el;
    }
    firstSeen.set(name, seen);
    if (first) first.scrollIntoView({ block: 'nearest' });
  }

  function makeSection(name, html) {
    const section = doc().createElement('section');
    section.dataset.name = name;
    const heading = doc().createElement('h2');
    heading.textContent = name;
    section.append(heading, doc().createElement('div'));
    fill(section, html);
    return section;
  }

  function renderPage() {
    const { sections } = pages[viewing];
    if (!sections.size) {
      const empty = doc().createElement('div');
      empty.id = 'empty';
      empty.textContent = EMPTY;
      doc().body.replaceChildren(empty);
    } else {
      doc().body.replaceChildren(...[...sections].map(([name, html]) => makeSection(name, html)));
    }
    doc().documentElement.scrollTop = 0;
    renderNav();
  }

  function renderNav() {
    const many = pages.length > 1;
    $('page-prev').hidden = !many;
    $('page-next').hidden = !many;
    $('page-prev').disabled = viewing === 0;
    $('page-next').disabled = viewing === latest();
    $('page-latest').hidden = viewing === latest();
    $('page-label').textContent = many ? `${pages[viewing].title} · ${viewing + 1} of ${pages.length}` : pages[viewing].title;
  }

  function go(index) {
    viewing = Math.max(0, Math.min(latest(), index));
    renderPage();
  }

  async function setSection(name, html) {
    await loaded;
    pages[latest()].sections.set(name, html);
    if (viewing !== latest()) return;
    const existing = [...doc().querySelectorAll('section')].find((s) => s.dataset.name === name);
    if (existing) {
      const before = blockKeys(existing);
      fill(existing, html);
      markNew(name, existing, before);
    } else {
      doc().getElementById('empty')?.remove();
      const section = makeSection(name, html);
      doc().body.append(section);
      markNew(name, section, new Set());
    }
  }

  async function removeSection(name) {
    await loaded;
    pages[latest()].sections.delete(name);
    if (viewing === latest()) renderPage();
  }

  // Someone reading an older board stays there; "Latest" brings them back.
  async function newPage(title) {
    await loaded;
    const follow = viewing === latest();
    if (pages[latest()].sections.size) pages.push({ title, sections: new Map() });
    else pages[latest()].title = title;
    firstSeen = new Map();
    if (follow) go(latest());
    else renderNav();
  }

  async function clear() {
    await loaded;
    fresh();
    firstSeen = new Map();
    renderPage();
  }

  $('page-prev').addEventListener('click', () => go(viewing - 1));
  $('page-next').addEventListener('click', () => go(viewing + 1));
  $('page-latest').addEventListener('click', () => go(latest()));

  fresh();
  loaded.then(renderPage);
  return { setSection, removeSection, newPage, clear };
})();
