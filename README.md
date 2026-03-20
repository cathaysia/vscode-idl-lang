# VSCode IDL Language

This extension provides syntax highlighting for IDL.

## Features

- Syntax highlighting for `.idl` files
- Enhanced tree-sitter-based semantic highlighting

## Requirements

No additional dependencies are required for syntax highlighting.

## Development

```bash
npm ci
npm run esbuild
```

## Updating the Tree-Sitter Grammar

The extension uses tree-sitter for enhanced syntax highlighting. The IDL grammar WASM file is committed to the repository for reliability and simplicity. To update it:

```bash
# Clone tree-sitter-idl (v3.17.0)
cd /tmp
git clone https://github.com/cathaysia/tree-sitter-idl
cd tree-sitter-idl
git checkout v3.17.0

# Build the WASM file (requires tree-sitter CLI and Docker)
tree-sitter build --wasm

# Copy to the extension
cp tree-sitter-idl.wasm /path/to/vscode-idl-lang/parsers/

# If queries have changed, update them too
cp queries/highlights.scm /path/to/vscode-idl-lang/queries/
```

After updating, test the extension in the Extension Development Host to ensure highlighting still works correctly.
