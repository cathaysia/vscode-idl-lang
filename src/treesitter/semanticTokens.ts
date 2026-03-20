import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  tokenTypes,
  tokenModifiers,
  mapCaptureToToken,
  getTokenTypeIndex,
} from './captures';
import { getParserModule, parseDocument, parseDocumentIncremental } from './parser';

export const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

interface CachedTree {
  version: number;
  tree: any;
}

/**
 * Semantic token provider using tree-sitter
 */
export class IdlSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  private trees: Map<string, CachedTree> = new Map();
  private documentChanges: Map<string, vscode.TextDocumentContentChangeEvent[]> = new Map();
  private query: any | null = null;
  private language: any | null = null;
  private debugEnabled = true;

  constructor(
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * Initialize the tree-sitter query from highlights.scm
   */
  async initialize(language: any): Promise<void> {
    this.language = language;

    // Load the highlights query
    const queryPath = path.join(this.context.extensionPath, 'queries', 'highlights.scm');
    console.log(`[IDL] Loading query from ${queryPath}`);
    const querySource = fs.readFileSync(queryPath, 'utf8');
    console.log(`[IDL] Query file read (${querySource.length} chars)`);

    try {
      const ts = getParserModule();
      this.query = new ts.Query(language, querySource);
      console.log(`[IDL] Query loaded (${querySource.length} chars)`);
    } catch (error) {
      console.error('[IDL Tree-sitter] Error loading query:', error);
      vscode.window.showErrorMessage(`Failed to load IDL syntax highlighting query: ${error}`);
      throw error;
    }
  }

  /**
   * Track document changes for incremental parsing
   */
  onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.languageId !== 'idl') {
      return;
    }

    const uri = event.document.uri.toString();
    const cached = this.trees.get(uri);

    // Only track changes if we have a cached tree for this document
    if (cached && event.contentChanges.length > 0) {
      const changes = this.documentChanges.get(uri) || [];
      changes.push(...event.contentChanges);
      this.documentChanges.set(uri, changes);
    }
  }

  /**
   * Provide semantic tokens for a document
   */
  async provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.SemanticTokens | null> {
    if (!this.query || token.isCancellationRequested) {
      if (!this.query) {
        console.warn('[IDL] semanticTokens requested but query not initialized');
      }
      return null;
    }

    const uri = document.uri.toString();
    if (this.debugEnabled) {
      console.log(`[IDL] semanticTokens for ${uri} (lang=${document.languageId})`);
    }
    const cached = this.trees.get(uri);
    const changes = this.documentChanges.get(uri);

    let tree: any | null = null;

    // Use incremental parsing if we have a cached tree and changes
    if (cached && changes && changes.length > 0 && cached.version < document.version) {
      tree = parseDocumentIncremental(document, cached.tree, changes);
      // Clear the changes after applying them
      this.documentChanges.delete(uri);
    }

    // Fall back to full parse if incremental parsing failed or not applicable
    if (!tree) {
      tree = parseDocument(document);
    }

    if (!tree) {
      return null;
    }

    // Cache the tree for future incremental updates
    this.trees.set(uri, {
      version: document.version,
      tree,
    });

    // Build semantic tokens
    const builder = new vscode.SemanticTokensBuilder(legend);
    this.collectTokens(tree, builder, document);

    return builder.build();
  }

  /**
   * Collect semantic tokens from a tree-sitter tree using queries
   */
  private collectTokens(
    tree: any,
    builder: vscode.SemanticTokensBuilder,
    document: vscode.TextDocument
  ): void {
    if (!this.query) {
      return;
    }

    // Execute the query to get captures
    const captures = this.query.captures(tree.rootNode);
    const debugCounts: Record<string, number> | null = this.debugEnabled ? {} : null;
    const chosenByLine: Map<number, Array<{ start: number; end: number }>> = new Map();

    const getPriority = (captureName: string): number => {
      // Annotations/attributes should win over generic types/identifiers
      if (captureName === 'attribute' || captureName === 'attribute.builtin' || captureName === 'annotation') {
        return 30;
      }
      // Lower priority for generic identifier fallback
      if (captureName === 'variable') {
        return 1;
      }
      // Slightly lower for punctuation/operators
      if (captureName.startsWith('punctuation.') || captureName === 'operator') {
        return 2;
      }
      return 10;
    };

    const overlapsExisting = (line: number, start: number, end: number): boolean => {
      const ranges = chosenByLine.get(line);
      if (!ranges) {
        return false;
      }
      for (const r of ranges) {
        if (start < r.end && end > r.start) {
          return true;
        }
      }
      return false;
    };

    const recordRange = (line: number, start: number, end: number): void => {
      const ranges = chosenByLine.get(line) || [];
      ranges.push({ start, end });
      chosenByLine.set(line, ranges);
    };

    type Candidate = {
      name: string;
      node: any;
      tokenType: string;
      tokenModifiers: string[];
      priority: number;
    };

    const candidates: Candidate[] = [];

    // Process each capture with error handling
    for (const capture of captures) {
      try {
        const { name, node } = capture;
        if (debugCounts) {
          debugCounts[name] = (debugCounts[name] || 0) + 1;
        }

        // Map the capture name to a token type
        const tokenMapping = mapCaptureToToken(name);
        if (!tokenMapping) {
          continue;
        }

        const tokenTypeIndex = getTokenTypeIndex(tokenMapping.type);
        if (tokenTypeIndex < 0) {
          continue;
        }

        // Get the range of the node
        const startPos = new vscode.Position(node.startPosition.row, node.startPosition.column);
        const endPos = new vscode.Position(node.endPosition.row, node.endPosition.column);

        // Skip multi-line tokens - VSCode's semantic token API works best with single-line tokens
        // Multi-line constructs (heredocs, multi-line strings, comments) are still highlighted
        // by the base TextMate grammar
        if (startPos.line !== endPos.line) {
          continue;
        }

        candidates.push({
          name,
          node,
          tokenType: tokenMapping.type,
          tokenModifiers: tokenMapping.modifiers || [],
          priority: getPriority(name),
        });
      } catch (error) {
        // Log and continue to avoid breaking all highlighting on a single capture error
        console.error('[IDL Tree-sitter] Error processing capture:', error);
        continue;
      }
    }

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      const aLen = a.node.endPosition.column - a.node.startPosition.column;
      const bLen = b.node.endPosition.column - b.node.startPosition.column;
      return aLen - bLen;
    });

    for (const c of candidates) {
      const startPos = new vscode.Position(c.node.startPosition.row, c.node.startPosition.column);
      const endPos = new vscode.Position(c.node.endPosition.row, c.node.endPosition.column);
      if (startPos.line !== endPos.line) {
        continue;
      }
      const line = startPos.line;
      const start = startPos.character;
      const end = endPos.character;

      if (overlapsExisting(line, start, end)) {
        continue;
      }

      recordRange(line, start, end);
      const range = new vscode.Range(startPos, endPos);
      builder.push(range, c.tokenType, c.tokenModifiers);
    }

    if (debugCounts) {
      const sorted = Object.entries(debugCounts).sort((a, b) => b[1] - a[1]);
      console.log(
        `[IDL] capture counts (${document.uri.toString()}): ` +
          sorted.map(([k, v]) => `${k}=${v}`).join(', ')
      );
    }
  }

  /**
   * Clean up cached tree and changes when document is closed
   */
  cleanupDocument(uri: string): void {
    const cached = this.trees.get(uri);
    if (cached) {
      cached.tree.delete();
      this.trees.delete(uri);
    }
    this.documentChanges.delete(uri);
  }
}

/**
 * Register the semantic token provider
 */
export async function registerSemanticTokensProvider(
  context: vscode.ExtensionContext,
  language: any
): Promise<void> {
  const provider = new IdlSemanticTokensProvider(context);

  // Initialize the provider with the query
  try {
    await provider.initialize(language);
  } catch (error) {
    console.error('Failed to initialize semantic tokens provider:', error);
    return;
  }

  // Register for IDL files
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'idl', scheme: 'file' },
      provider,
      legend
    )
  );

  // Track document changes for incremental parsing
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      provider.onDocumentChange(event);
    })
  );

  // Clean up trees when documents are closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.languageId === 'idl') {
        provider.cleanupDocument(doc.uri.toString());
      }
    })
  );
}
