---
name: idl-packaging
description: Package the vscode-idl-lang VS Code extension into a .vsix using vsce. Use when the user asks how to build/package the extension, regenerate a VSIX, or when npm run package fails and a workaround is needed.
---

# IDL VSIX Packaging

## Quick Workflow

1. From the repo root, package with vsce:

```bash
npx vsce package --no-dependencies
```

2. The VSIX is written to the repo root, e.g.:

- `vscode-idl-lang-0.9.8.vsix`

## Notes

- `npm run package` can fail if `npm list` reports extraneous or missing deps. In that case, use `npx vsce package --no-dependencies`.
- `vsce` will run the `vscode:prepublish` script automatically, which builds `out/main.js` via esbuild.

## Troubleshooting

- If the build output looks stale, run a clean build first:

```bash
npm run esbuild-base -- --minify
npx vsce package --no-dependencies
```

- If VSIX contents are missing files, check `.vscodeignore` rules.
