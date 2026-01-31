import type { Monaco } from "@monaco-editor/react";
import type { languages, editor, Position, IRange } from "monaco-editor";

/**
 * RSES Language Definition for Monaco Editor
 * Provides syntax highlighting for the Rule Set Evaluation System config format
 */

export const RSES_LANGUAGE_ID = "rses";

// Token provider for RSES syntax highlighting
export const rsesTokensProvider: languages.IMonarchLanguage = {
  // Default token class
  defaultToken: "",

  // Token types
  tokenizer: {
    root: [
      // Comments (# comment)
      [/#.*$/, "comment"],

      // Section headers [section.name]
      [/^\s*\[[\w.]+\]/, "type.identifier"],

      // Rule arrow ->
      [/->/, "keyword.operator"],

      // Boolean operators in compound expressions
      [/[&|!()]/, "operator"],

      // Set references $name
      [/\$[a-zA-Z_][a-zA-Z0-9_]*/, "variable"],

      // Attribute patterns {attr = value}
      [/\{/, "delimiter.bracket", "@attributePattern"],

      // Key in key = value
      [/^[a-zA-Z_][a-zA-Z0-9_]*(?=\s*=)/, "variable.name"],

      // Equals sign
      [/=/, "operator"],

      // String values (quoted)
      [/"[^"]*"/, "string"],
      [/'[^']*'/, "string"],

      // Wildcard
      [/\*/, "keyword"],

      // Glob patterns
      [/\*\*?/, "regexp"],

      // Numbers
      [/\b\d+\b/, "number"],

      // Boolean values
      [/\b(true|false)\b/, "keyword"],

      // Path-like values
      [/[a-zA-Z_][\w\-./]*/, "string"],
    ],

    attributePattern: [
      [/\}/, "delimiter.bracket", "@pop"],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, "variable.parameter"],
      [/=/, "operator"],
      [/\*/, "keyword"],
      [/[^\s}]+/, "string"],
      [/\s+/, ""],
    ],
  },

  // Ignored tokens
  ignoreCase: false,
};

// Language configuration for bracket matching, comments, etc.
export const rsesLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: "#",
  },
  brackets: [
    ["[", "]"],
    ["{", "}"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /^\s*\[/,
      end: /^\s*\[/,
    },
  },
};

// Dark theme tokens for RSES
export const rsesDarkTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    { token: "type.identifier", foreground: "4EC9B0", fontStyle: "bold" },
    { token: "keyword.operator", foreground: "C586C0" },
    { token: "operator", foreground: "D4D4D4" },
    { token: "variable", foreground: "9CDCFE" },
    { token: "variable.name", foreground: "DCDCAA" },
    { token: "variable.parameter", foreground: "9CDCFE" },
    { token: "string", foreground: "CE9178" },
    { token: "number", foreground: "B5CEA8" },
    { token: "keyword", foreground: "569CD6" },
    { token: "regexp", foreground: "D16969" },
    { token: "delimiter.bracket", foreground: "FFD700" },
  ],
  colors: {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",
    "editor.lineHighlightBackground": "#2a2a2a",
    "editorLineNumber.foreground": "#858585",
    "editorLineNumber.activeForeground": "#c6c6c6",
    "editor.selectionBackground": "#264f78",
    "editorCursor.foreground": "#aeafad",
  },
};

// Completion items for RSES
export function getCompletionItems(
  model: editor.ITextModel,
  position: Position
): languages.CompletionItem[] {
  const lineContent = model.getLineContent(position.lineNumber);
  const items: languages.CompletionItem[] = [];

  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column,
    endColumn: position.column,
  };

  // Section completions at start of line
  if (lineContent.trim() === "" || lineContent.trim() === "[") {
    const sections = [
      "defaults",
      "sets",
      "sets.attributes",
      "sets.compound",
      "rules.topic",
      "rules.type",
      "rules.filetype",
      "overrides.topic",
      "overrides.type",
      "security",
    ];

    for (const section of sections) {
      items.push({
        label: `[${section}]`,
        kind: 14, // Keyword
        insertText: `[${section}]\n`,
        range,
        documentation: `${section} section`,
      });
    }
  }

  // Defaults keys
  if (lineContent.includes("[defaults]") || lineContent.includes("auto_")) {
    const defaults = ["auto_topic", "auto_type", "delimiter"];
    for (const key of defaults) {
      items.push({
        label: key,
        kind: 5, // Field
        insertText: `${key} = `,
        range,
      });
    }
  }

  return items;
}

/**
 * Registers the RSES language with Monaco Editor
 */
export function registerRsesLanguage(monaco: Monaco): void {
  // Register the language
  monaco.languages.register({ id: RSES_LANGUAGE_ID });

  // Set the token provider
  monaco.languages.setMonarchTokensProvider(RSES_LANGUAGE_ID, rsesTokensProvider);

  // Set language configuration
  monaco.languages.setLanguageConfiguration(RSES_LANGUAGE_ID, rsesLanguageConfig);

  // Register completion provider
  monaco.languages.registerCompletionItemProvider(RSES_LANGUAGE_ID, {
    provideCompletionItems: (model: editor.ITextModel, position: Position) => {
      return {
        suggestions: getCompletionItems(model, position),
      };
    },
  });

  // Define and register the dark theme
  monaco.editor.defineTheme("rses-dark", rsesDarkTheme);
}
