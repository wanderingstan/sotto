// terminal.js: the live Claude session, so the user can talk to it during the call.
window.claudeTerminal = (() => {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = () => (dark.matches
    ? { background: '#1b1b1b', foreground: '#ececec', cursor: '#ececec' }
    : { background: '#ffffff', foreground: '#1a1a1a', cursor: '#1a1a1a' });

  const term = new window.Terminal({ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', theme: theme(), scrollback: 5000 });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('terminal'));
  fit.fit();

  dark.addEventListener('change', () => { term.options.theme = theme(); });
  term.onData((data) => window.sotto.termInput(data));
  window.sotto.onTermData((data) => term.write(data));
  term.onResize(({ cols, rows }) => window.sotto.termResize({ cols, rows }));
  new ResizeObserver(() => fit.fit()).observe(document.getElementById('terminal'));

  return {
    /** Clear for a new session and report the size Claude should start at. */
    start() {
      term.reset();
      fit.fit();
      return { cols: term.cols, rows: term.rows };
    },
  };
})();
