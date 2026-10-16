# Practice Sync setup

This is a one-time setup, about 5 minutes. When it's done, your phone and computer share one record, and it's saved in your Google Drive.

1. Go to <https://script.google.com> and choose **New project**. Name it **Practice Sync**.
2. Replace everything in `Code.gs` with the contents of `sync/Code.gs`, then save.
3. Choose `setup` in the function menu and press **Run**. Approve the Google permission screen. This creates the `Practice Sync` folder in your Drive and a private key.
4. Choose **Deploy → New deployment → Web app**, with these settings:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Press **Deploy** and copy the URL that ends in `/exec`.
5. Paste that URL between the quotes in `const WEB_APP_URL = '';` at the top of `Code.gs`. Save, then run `setup` again.
6. The log shows your sync code, starting with `PR1.`. It's also saved in `Practice Sync/Sync code.txt` in Drive.
7. In the app on each device, open **Settings → Sync with Google Drive**, paste the code, and tap **Connect**.

## How it behaves

- Changes sync a moment after you make them, and again whenever the app opens.
- With no signal, check-offs stay on the device and go up the next time it's online.
- For each practice on each day, the newest edit wins. Merging never drops a logged day, so a new or wiped device can't erase your record.
- Drive keeps `latest.json` plus one copy per day in `history/`.

## If the code leaks

The repo is public, so the code never goes in it. If you ever paste it somewhere public, run `resetKey` in the script. The old code stops working. Paste the new code from `Sync code.txt` into each device.

## If you change Code.gs later

Use **Deploy → Manage deployments → Edit → New version**. That keeps the same URL, so your sync code keeps working.
