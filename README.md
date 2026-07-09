# Forge Athlete v9.6 — iPhone Chunked Pull Fix

This build adds a safer pull mode for iPhone Safari/Home Screen apps. Instead of returning the whole database in one JSONP/iframe response, Apps Script can now return the latest backup in small chunks using `pullMeta` and `pullChunk`.

## Must update BOTH parts

1. Upload the website files to GitHub Pages.
2. Replace Apps Script with `google-apps-script.gs`.
3. Set `SECRET_TOKEN` to the same token as Forge Settings.
4. Save, then Deploy → Manage deployments → Edit → Version: New version → Deploy.
5. On laptop/main device, Push all data now.
6. On iPhone, open Safari first, check Settings shows v9.6, then Run diagnostics.

If Home Screen app still shows old version, delete the Home Screen icon and add it again from Safari.
