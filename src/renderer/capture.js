// capture.js: pull mic and system audio into two 16 kHz mono PCM streams.
window.capture = (() => {
  let taps = [];

  async function tap(name, stream, { onChunk, onEnded }) {
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule('tap-worklet.js');
    await ctx.resume();
    const node = new AudioWorkletNode(ctx, 'tap');
    ctx.createMediaStreamSource(stream).connect(node);
    node.connect(ctx.destination); // silent output; keeps the node being pulled
    node.port.onmessage = ({ data }) => onChunk(name, data);
    const [track] = stream.getAudioTracks();
    window.sotto.status(`${name}: track "${track.label}" state=${track.readyState}`);
    const entry = { ctx, stream, stopping: false };
    track.onended = () => { if (!entry.stopping) onEnded(name); };
    taps.push(entry);
    // Without the system audio permission Chromium returns a track that has already
    // ended, with no error, so this has to be checked rather than waited for.
    if (track.readyState === 'ended') onEnded(name);
  }

  async function startMic(handlers) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    await tap('mic', stream, handlers);
  }

  async function startSystem(handlers) {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
    if (!stream.getAudioTracks().length) throw new Error('no audio track returned');
    await tap('system', stream, handlers);
  }

  function stop() {
    for (const entry of taps) {
      entry.stopping = true;
      entry.stream.getTracks().forEach((t) => t.stop());
      entry.ctx.close();
    }
    taps = [];
  }

  return { startMic, startSystem, stop };
})();
