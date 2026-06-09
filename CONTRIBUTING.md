# Contributing

Thanks for helping improve ClipSave.

## Local Setup

```bash
npm install
npm start
```

## Checks

Run these before opening a pull request:

```bash
npm run check
npm audit --omit=optional
npm run site:check
```

## Release Builds

```bash
npm run dist
```

Release files are generated in `dist/`.

## Pull Request Guidelines

- Keep UI copy friendly and non-technical.
- Do not add DRM, paywall, login-cookie bypass, or private-media bypass features.
- Keep macOS and Windows packaging working together.
- Prefer small, focused pull requests.
