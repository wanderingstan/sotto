# Sotto roadmap

Sotto is a silent companion for one person on a call. It listens to the mic and system audio, and a local Claude keeps a private board. It never speaks.

## Future enhancements

### Captions from a browser extension

Borrow from Vibeconferencing to build a Chrome extension that grabs the live captions from Meet, Teams, Zoom and Slack calls, and feed them in as a caption source alongside on-device transcription.

- **Free diarization on multi-participant calls:** captions name each speaker, where system audio can only say "Them".
- **Better, free speech-to-text:** the platforms' own captions replace Whistle for those calls.

Only calls running in the browser would be covered, so on-device transcription stays for desktop calling apps and for platforms without captions.

### Choosing the model

Let the user pick Claude's model in the app. It uses Opus for now.

## Before relying on it

- **Test Zoom and Teams:** a real Google Meet call in the browser has worked with a headset. Desktop Zoom and Teams haven't been tried.
- **Keep nothing on disk:** interactive Claude Code writes the call's words to its session log under `~/.claude/projects`. Delete or avoid that log before claiming nothing is kept.
- **Tighten what can leave the machine:** images and websites load addresses Claude chooses, so a hostile caller could try to get call details into one. A stricter mode would load them only when clicked.
- **Test the other packages:** run the Intel Mac and Windows builds, and sign the Windows installer so SmartScreen doesn't warn people.
- **Give it an icon:** it still has Electron's default.
