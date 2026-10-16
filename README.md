# Practice

A weekly practice tracker. Check off each practice for today, and fill in earlier days from the week dots. Each practice has a weekly target, and the Calendar tab shows your history and how many weeks in a row you've hit each target.

It runs as a web app you add to your iPhone home screen, and it works offline. Your data stays on the device, and it can sync between devices through your own Google Drive (see [`sync/README.md`](sync/README.md)).

## Host it on GitHub Pages

1. Push these files to a repo, for example `practice`.
2. In the repo, go to **Settings → Pages**. Set the source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.
3. Open `https://<your-username>.github.io/practice/` on your iPhone in Safari. Tap **Share → Add to Home Screen**.

## Shipping changes

Bump `CACHE` in `sw.js` whenever you change a file. Installed copies then pick up the new version the next time they open.

## Files

- `index.html`, `styles.css`, `app.js`: the app itself. No build step.
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and the home-screen icon.
- `sync/Code.gs`: the Google Apps Script that keeps the shared record in Drive.
