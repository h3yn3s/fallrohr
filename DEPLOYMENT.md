# Deployment

## Release flow

```sh
# 1. commit your changes
git add <files>
git commit -m "description of changes"

# 2. bump version (updates package.json, commits, and creates a git tag)
npm version <patch|minor|major> --tag-version-prefix=""

# 3. push commit and tag
git push && git push --tags
```

`npm version` handles:

- updating `version` in `package.json`
- creating a git commit
- creating a git tag (without `v` prefix)

The version from `package.json` is baked into the build and displayed on the settings page.

## What happens on push

The GitHub Actions workflow (`.github/workflows/docker.yml`) triggers on:

- pushes to `main` — builds and pushes the `main` tag
- version tags (`X.Y.Z`) — builds and pushes `X.Y.Z`, `X.Y`, `latest`, and creates a GitHub release

Docker images are published to `ghcr.io/h3yn3s/fallrohr`.

## Version tags

| Tag      | When updated        |
| -------- | ------------------- |
| `main`   | every push to main  |
| `X.Y.Z`  | on version tag push |
| `X.Y`    | on version tag push |
| `latest` | on version tag push |
| `sha-*`  | every push          |
