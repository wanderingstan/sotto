// site-pane.js: a web page beside the board, walled off from everything else. No preload,
// no stored session, no permissions, no downloads, no popups, no local addresses. Muted,
// because system audio capture would otherwise transcribe it as the other side of the call.
const { WebContentsView, session } = require('electron');
const { checkPublicUrl, isPrivateHost } = require('./agent/url-safety.js');

const PARTITION = 'sotto-site';

class SitePane {
  constructor({ win, log = () => {}, onUrl = () => {}, onFail = () => {} }) {
    this._win = win;
    this._log = log;
    this._onUrl = onUrl;
    this._onFail = onFail;
    this._view = null;
    this._layout = null;

    const ses = session.fromPartition(PARTITION);
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (e) => e.preventDefault());
    ses.webRequest.onBeforeRequest((details, callback) => {
      let cancel = true;
      try {
        const url = new URL(details.url);
        cancel = !['http:', 'https:', 'ws:', 'wss:', 'blob:', 'data:'].includes(url.protocol)
          || ((url.protocol.startsWith('http') || url.protocol.startsWith('ws')) && isPrivateHost(url.hostname));
      } catch { /* unparseable stays cancelled */ }
      if (cancel) this._log('[site] blocked a request');
      callback({ cancel });
    });
  }

  /** Throws if the URL isn't allowed, so the agent hears why. */
  show(raw) {
    const url = checkPublicUrl(raw);
    if (!this._view) this._create();
    const contents = this._view.webContents;
    contents.loadURL(url.href).catch((err) => {
      if (err.code !== 'ERR_ABORTED') this._onFail(err.code || err.message);
    });
    this._apply();
  }

  _create() {
    const view = new WebContentsView({
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const contents = view.webContents;
    contents.setAudioMuted(true);
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('did-navigate', (_e, url) => this._onUrl(url));
    contents.on('did-navigate-in-page', (_e, url) => this._onUrl(url));
    this._win.contentView.addChildView(view);
    this._view = view;
  }

  /** { x, y, width, height, visible } of the placeholder in the window. */
  layout(layout) {
    this._layout = layout;
    this._apply();
  }

  _apply() {
    if (!this._view || !this._layout) return;
    const { x, y, width, height, visible } = this._layout;
    this._view.setVisible(Boolean(visible));
    if (visible) this._view.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  }

  close() {
    if (!this._view) return;
    this._win.contentView.removeChildView(this._view);
    this._view.webContents.close();
    this._view = null;
  }
}

module.exports = { SitePane };
