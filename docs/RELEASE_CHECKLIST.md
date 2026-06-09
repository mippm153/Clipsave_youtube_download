# Release Checklist

## Before Tagging

- [ ] Confirm links point to `mippm153/Clipsave_youtube_download`.
- [ ] Run `npm install`.
- [ ] Run `npm run check`.
- [ ] Run `npm run site:check`.
- [ ] Run `npm audit --omit=optional`.
- [ ] Run `npm run dist`.
- [ ] Confirm macOS zip integrity.
- [ ] Confirm Windows zip integrity.

## Manual Runtime Checks

- [ ] macOS app opens.
- [ ] macOS MP4 download completes.
- [ ] macOS MP3 download leaves only `.mp3`.
- [ ] Windows app opens.
- [ ] Windows MP4 download completes.
- [ ] Windows MP3 download leaves only `.mp3`.

## Website Checks

- [ ] Cloudflare Pages site opens on desktop.
- [ ] Cloudflare Pages site opens on mobile.
- [ ] macOS download button works.
- [ ] Windows download button works.
- [ ] GitHub source link works.
- [ ] Issue link works.
- [ ] Release notes link works.
