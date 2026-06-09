# Deployment

This project has two public surfaces:

1. Desktop release files, hosted on GitHub Releases.
2. The marketing website in `site/`, hosted on Cloudflare Pages.

Do not upload the desktop zip files to Cloudflare Pages. They are larger than the Cloudflare Pages single static asset limit.

## 1. Create the GitHub Repository

Recommended repository:

```text
https://github.com/mippm153/Clipsave_youtube_download
```

If the repository changes later, update the website links with:

```bash
npm run configure:repo -- mippm153/Clipsave_youtube_download
```

## 2. Publish a Release

Create and push a tag:

```bash
git tag v1.4.0
git push origin v1.4.0
```

The GitHub Actions release workflow builds:

- `ClipSave-1.4.0-mac-arm64.zip`
- `ClipSave-1.4.0-win-x64.zip`

and uploads both files to the GitHub Release.

## 3. Deploy the Website to Cloudflare Pages

### Option A: Git Integration

In Cloudflare Pages:

- Connect `mippm153/Clipsave_youtube_download`.
- Build command: leave blank.
- Output directory: `site`.

Cloudflare will deploy the static site on every push.

### Option B: Direct Upload with Wrangler

After logging in to Wrangler:

```bash
npx wrangler pages deploy site --project-name clipsave
```

Use this when you want to deploy prebuilt static assets directly.

## 4. Final Production Checks

- Open the Cloudflare Pages URL.
- Check `/download/mac` redirects to the latest macOS GitHub Release asset.
- Check `/download/windows` redirects to the latest Windows GitHub Release asset.
- Download both release files from the website.
- Run the macOS app.
- Run the Windows app on a Windows x64 machine or VM.
