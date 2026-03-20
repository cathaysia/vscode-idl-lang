import * as path from 'path';
import * as vscode from 'vscode';

let parserInitialized = false;
let idlParser: any | null = null;
let idlLanguage: any | null = null;
let parserModule: any | null = null;

function loadParserModule(context: vscode.ExtensionContext): any {
  if (parserModule) {
    return parserModule;
  }
  const modulePath = path.join(context.extensionPath, 'parsers', 'web-tree-sitter.cjs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  parserModule = require(modulePath);
  return parserModule;
}

/**
 * Initialize tree-sitter and load the IDL language grammar
 */
export async function initializeParser(context: vscode.ExtensionContext): Promise<any> {
  if (idlParser && idlLanguage) {
    return idlParser;
  }

  const ts = loadParserModule(context);

  if (!parserInitialized) {
    // Initialize tree-sitter WASM runtime
    const wasmPath = path.join(context.extensionPath, 'parsers', 'web-tree-sitter.wasm');

    await ts.Parser.init({
      locateFile(_file: string, _folder: string) {
        return wasmPath;
      }
    });
    parserInitialized = true;
  }

  // Load IDL language grammar
  const idlWasmPath = path.join(context.extensionPath, 'parsers', 'tree-sitter-idl.wasm');

  idlLanguage = await ts.Language.load(idlWasmPath);

  // Create parser instance
  idlParser = new ts.Parser();
  idlParser.setLanguage(idlLanguage);

  return idlParser;
}

/**
 * Get the initialized parser (throws if not initialized)
 */
export function getParser(): any {
  if (!idlParser) {
    throw new Error('Parser not initialized. Call initializeParser first.');
  }
  return idlParser;
}

export function getParserModule(): any {
  if (!parserModule) {
    throw new Error('Parser module not initialized. Call initializeParser first.');
  }
  return parserModule;
}

/**
 * Parse a document with the IDL parser
 */
export function parseDocument(document: vscode.TextDocument): any | null {
  const parser = getParser();
  try {
    return parser.parse(document.getText());
  } catch (error) {
    console.error('Error parsing document:', error);
    return null;
  }
}

/**
 * Apply incremental edits to a tree for better performance
 */
export function parseDocumentIncremental(
  document: vscode.TextDocument,
  previousTree: any,
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): any | null {
  const parser = getParser();

  try {
    // Apply edits to the tree
    for (const change of changes) {
      const startIndex = change.rangeOffset;
      const oldEndIndex = change.rangeOffset + change.rangeLength;
      const newEndIndex = change.rangeOffset + change.text.length;

      const startPos = document.positionAt(startIndex);
      const oldEndPos = document.positionAt(oldEndIndex);
      const newEndPos = document.positionAt(newEndIndex);

      previousTree.edit({
        startIndex,
        oldEndIndex,
        newEndIndex,
        startPosition: { row: startPos.line, column: startPos.character },
        oldEndPosition: { row: oldEndPos.line, column: oldEndPos.character },
        newEndPosition: { row: newEndPos.line, column: newEndPos.character },
      });
    }

    // Reparse with the edited tree
    return parser.parse(document.getText(), previousTree);
  } catch (error) {
    console.error('Error during incremental parsing:', error);
    return null;
  }
}
