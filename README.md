# Forge Athlete — phone PWA with optional Google Sheets mirror

Upload these files to the root of your GitHub Pages repo. Do not upload your personal backup JSON.

## Files to upload to GitHub Pages
- index.html
- manifest.json
- sw.js
- .nojekyll
- icon-180.png
- icon-192.png
- icon-512.png
- README.md

## Optional Google Sheets sync
1. Create a Google Sheet named `Forge Training Log`.
2. In the Sheet, go to Extensions -> Apps Script.
3. Paste `google-apps-script.gs` into Code.gs.
4. Change `SECRET_TOKEN` to a long random phrase.
5. Deploy -> New deployment -> Web app.
   - Execute as: Me
   - Who has access: Anyone with the link
6. Copy the Web App `/exec` URL.
7. Open Forge -> Settings -> Google Sheets mirror.
8. Paste the URL and the same secret token, enable sync, and press Push all data now.

Keep the script URL and token off GitHub. Type them only inside Forge Settings on your own phone.


## Auto-sync behavior

This build pushes a full Google Sheets mirror after every saved log when Settings -> Google Sheets mirror is enabled and Auto-push is checked.

It triggers after:
- Finish workout
- Add cardio
- Add body/recovery entry
- Delete cardio/body entry

If the phone is offline or the request fails, Forge keeps a pending sync flag and retries when the app is opened, when the phone comes back online, and every 5 minutes while the app is open.
