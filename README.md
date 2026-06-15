# Forge — GitHub Pages PWA

This is the clean public-upload version of Forge. It contains the app code, icons, manifest, and offline service worker. It does **not** include your personal workout logs.

## Upload these files to GitHub

Upload everything in this folder to the root of your GitHub repository:

- `index.html`
- `manifest.json`
- `sw.js`
- `.nojekyll`
- `icons/`

Do **not** upload backup JSON files unless you are okay with them being public.

## GitHub Pages setup

1. Create a new GitHub repository, for example `forge`.
2. Upload the files above directly into the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Open the generated `https://YOURUSERNAME.github.io/forge/` link on iPhone Safari.
7. Tap **Share → Add to Home Screen**. If shown, turn on **Open as Web App**.
8. Open Forge from the Home Screen icon.
9. Import your workout JSON backup from inside Forge.

## Storage

Workout data is saved on the device/browser where you use Forge. Export backups weekly to iCloud Drive or Google Drive.
