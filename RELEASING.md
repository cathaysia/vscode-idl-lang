# Releasing vscode-idl-lang

## Required Secrets

- `VSCE_PAT`: VS Code Marketplace Personal Access Token with publish permissions.

## Release Process

1. Ensure `main` is green and the extension packages correctly.
2. Bump the version in `package.json` and update `CHANGELOG.md`.
3. Create and push a tag (for example `v0.10.0`).
4. The GitHub Actions workflow `Publish Extension` will build and publish the extension.
