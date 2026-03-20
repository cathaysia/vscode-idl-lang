import { ExtensionContext } from 'vscode';
import { initializeParser } from './treesitter/parser';
import { registerSemanticTokensProvider } from './treesitter/semanticTokens';

export async function activate(context: ExtensionContext): Promise<void> {
	console.log('[IDL] Extension activating');
	// Initialize tree-sitter for enhanced syntax highlighting
	try {
		const parser = await initializeParser(context);
		const language = parser.language;

		if (language) {
			await registerSemanticTokensProvider(context, language);
			console.log('[IDL] Semantic tokens provider registered');
		} else {
			console.warn('[IDL] Parser initialized but language missing');
		}
	} catch (error) {
		console.error('IDL tree-sitter initialization failed:', error);
	}
}

export function deactivate() {
	return;
}
