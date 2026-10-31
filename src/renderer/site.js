// site.js: the Board, Website and Instructions tabs. The website itself is a native view that main lays
// over the #site placeholder, so this only tells main where the placeholder is.
window.sitePane = (() => {
  const $ = (id) => document.getElementById(id);
  let current = null;
  let tab = 'board';

  function apply() {
    const on = (name) => tab === name;
    for (const name of ['board', 'site', 'instructions']) {
      $(`tab-${name}`).setAttribute('aria-selected', String(on(name)));
      $(name).hidden = !on(name);
      $(`${name === 'board' ? 'board' : name}-nav`).hidden = !on(name);
    }
    $('tab-site').hidden = !current;
    sendLayout();
  }

  function sendLayout() {
    const r = $('site').getBoundingClientRect();
    window.sotto.siteLayout({ x: r.x, y: r.y, width: r.width, height: r.height, visible: tab === 'site' });
  }

  function select(next) {
    tab = next;
    apply();
  }

  function setUrl(url) {
    current = url;
    $('site-url').textContent = url;
    $('site-url').title = url;
  }

  function reset() {
    current = null;
    if (tab === 'site') select('board');
    else apply();
  }

  $('tab-board').addEventListener('click', () => select('board'));
  $('tab-site').addEventListener('click', () => select('site'));
  $('tab-instructions').addEventListener('click', () => select('instructions'));
  $('site-open').addEventListener('click', () => { if (current) window.sotto.openLink(current); });
  $('site-close').addEventListener('click', () => { window.sotto.siteClose(); reset(); });
  new ResizeObserver(sendLayout).observe($('site'));
  window.addEventListener('resize', sendLayout);

  window.sotto.onSiteShown(({ url }) => { setUrl(url); select('site'); });
  window.sotto.onSiteUrl(({ url }) => { if (current) setUrl(url); });
  window.sotto.onSiteFailed(({ detail }) => { $('site-url').textContent = `Couldn’t load the page (${detail})`; });

  apply();
  return { reset };
})();
