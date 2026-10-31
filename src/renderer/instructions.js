// instructions.js: the user's own prompt for what Claude does with the call. It lives in
// a plain file: this saves to it as they type and reloads it when they come back from
// editing it elsewhere. Main reads it each time listening starts.
(() => {
  const box = document.getElementById('instructions');
  const state = document.getElementById('instructions-state');
  const resetButton = document.getElementById('instructions-reset');
  const openButton = document.getElementById('instructions-open');
  const NOTE = 'Applies the next time you start listening';
  let timer = null;

  function show({ isDefault, file }) {
    resetButton.disabled = isDefault;
    state.textContent = NOTE;
    if (file) openButton.title = file;
  }

  async function load() {
    if (timer) return;
    const result = await window.sotto.getInstructions();
    if (result.text !== box.value.trim()) box.value = result.text;
    show(result);
  }

  async function save() {
    timer = null;
    try {
      show(await window.sotto.setInstructions(box.value));
    } catch {
      state.textContent = 'Couldn’t save: too long';
    }
  }

  box.addEventListener('input', () => {
    clearTimeout(timer);
    state.textContent = 'Saving…';
    timer = setTimeout(save, 400);
  });
  box.addEventListener('blur', () => { if (timer) { clearTimeout(timer); save(); } });

  resetButton.addEventListener('click', async () => {
    clearTimeout(timer);
    const result = await window.sotto.resetInstructions();
    box.value = result.text;
    show(result);
  });

  openButton.addEventListener('click', () => window.sotto.openInstructions());
  window.addEventListener('focus', load);
  document.getElementById('tab-instructions').addEventListener('click', load);

  load();
})();
