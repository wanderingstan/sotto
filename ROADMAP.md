# Sotto roadmap

Sotto is a silent companion for one person on a call. It listens to the mic and system audio, and a local Claude keeps a private board. It never speaks.

## Future enhancements

### Captions from a browser extension

Borrow from Vibeconferencing to build a Chrome extension that grabs the live captions from Meet, Teams, Zoom and Slack calls, and feed them in as a caption source alongside on-device transcription.

- **Free diarization on multi-participant calls:** captions name each speaker, where system audio can only say "Them".
- **Better, free speech-to-text:** the platforms' own captions replace Whistle for those calls.

Only calls running in the browser would be covered, so on-device transcription stays for desktop calling apps and for platforms without captions.

## Before relying on it

- **Test a real call:** run a Zoom or Teams call with a headset.
- **Keep nothing on disk:** interactive Claude Code writes the call's words to its session log under `~/.claude/projects`. Delete or avoid that log before claiming nothing is kept.
- **Tighten what can leave the machine:** images and websites load addresses Claude chooses, so a hostile caller could try to get call details into one. A stricter mode would load them only when clicked.
- **Remove the startup delay:** Claude's first turn runs before its tools connect, so it takes about 30 seconds to start following the call.
- **Package the app:** it only runs from source, on macOS.
