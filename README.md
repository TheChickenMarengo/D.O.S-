# D.O.S (Distraction Obfuscation System)

A distraction-free, full-screen, MS-DOS-style word processor with colour, for writing novels and screenplays. Works on desktop and phone.

Features: coloured text, drop caps, dithered images, multiple documents, snapshots, chapter navigation, find and replace, word goals, screenplay mode, notes board, journal and dream journal, calendar, contacts, slash commands, global search, PIN privacy lock, CRT effect and DOS boot screen.

Files: `index.html`, `style.css`, `app.js` (no build step; open `index.html` in a browser).

Cross-device sync uses the Claude artifact database and only works when published as a Claude artifact; elsewhere the app runs from local storage.

## Install as an app

Host the repo over HTTPS (GitHub Pages: Settings > Pages > Deploy from branch `main`, folder `/`), open the page, then:
- Android/Chrome: menu > Install app (or Add to Home screen)
- iPhone/Safari: Share > Add to Home Screen
- Desktop Chrome/Edge: install icon in the address bar

It then runs full screen and works offline. Data stays in that app's own local storage (separate from the Claude artifact copy, and no cross-device sync outside the artifact; use Backup to move writing between them).

## Sync between devices (installed app)

File > Sync now (or the status text at the bottom) opens GitHub sync setup. Create a classic token at github.com/settings/tokens with only the `gist` scope, paste it on each device, and your writing syncs through one private gist called "D.O.S sync data". Inside the Claude artifact, sync uses the artifact's own database instead and needs no setup.
