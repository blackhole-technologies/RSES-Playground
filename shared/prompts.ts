/**
 * @file prompts.ts
 * @description User-facing text, error messages with actionable fixes
 * @phase Phase 5 - Prompting & Learning
 */

/**
 * Error code definitions with messages, fixes, and examples
 */
export interface ErrorInfo {
  code: string;
  title: string;
  description: string;
  fix: string;
  example?: {
    before: string;
    after: string;
  };
  learnMoreUrl?: string;
}

/**
 * All RSES error codes with actionable fixes
 */
export const errorCodes: Record<string, ErrorInfo> = {
  E001: {
    code: "E001",
    title: "Syntax Error",
    description: "The configuration syntax is invalid. This could be a missing bracket, incorrect arrow syntax, or empty value.",
    fix: "Check the line for proper formatting. Section headers need brackets [like-this], rules need arrows condition -> result, and values cannot be empty.",
    example: {
      before: "[sets\nmy-rule -> ",
      after: "[sets]\nmy-rule = pattern-*",
    },
  },

  E004: {
    code: "E004",
    title: "Unsafe Pattern",
    description: "The regex pattern could cause catastrophic backtracking (ReDoS vulnerability). Patterns with nested quantifiers are especially risky.",
    fix: "Simplify the pattern by removing nested quantifiers like (a+)+, ((a)+)+, or (a|b*)+. Use atomic groups or possessive quantifiers if needed.",
    example: {
      before: "pattern = ((a+)+)*",
      after: "pattern = a+",
    },
    learnMoreUrl: "https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS",
  },

  E005: {
    code: "E005",
    title: "Path Traversal Blocked",
    description: "The value contains path traversal sequences (..) or absolute paths that could access files outside the intended directory.",
    fix: "Use relative paths without .. sequences. Paths should stay within the project structure.",
    example: {
      before: "result = ../../../etc/passwd",
      after: "result = project-files",
    },
    learnMoreUrl: "https://owasp.org/www-community/attacks/Path_Traversal",
  },

  E006: {
    code: "E006",
    title: "Malformed Attribute",
    description: "The attribute definition syntax is incorrect. Attributes should use the {key = value} format.",
    fix: "Ensure the attribute follows the pattern {attribute_name = value}. Values can be specific strings or * for wildcard.",
    example: {
      before: "my-attr = {x = }",
      after: "my-attr = {source = claude}",
    },
  },

  E007: {
    code: "E007",
    title: "Invalid Compound Expression",
    description: "The compound set expression has syntax errors. Check for unmatched parentheses or invalid operators.",
    fix: "Compound expressions use $ to reference sets, & for AND, | for OR, and ! for NOT. Parentheses must be balanced.",
    example: {
      before: "combined = $set1 && $set2",
      after: "combined = $set1 & $set2",
    },
  },

  E008: {
    code: "E008",
    title: "Circular Dependency",
    description: "Compound sets reference each other in a cycle, which would cause infinite recursion during evaluation.",
    fix: "Reorganize compound sets to avoid cycles. Set A cannot depend on B if B depends on A (directly or indirectly).",
    example: {
      before: "[sets.compound]\na = $b\nb = $a",
      after: "[sets.compound]\na = $base1 & $base2\nb = $a | $base3",
    },
  },

  E009: {
    code: "E009",
    title: "Symbol Collision",
    description: "A symbol name is already used in another section. Set names must be unique across [sets], [sets.attributes], and [sets.compound].",
    fix: "Rename one of the conflicting symbols to make all names unique.",
    example: {
      before: "[sets]\nproject = p-*\n[sets.attributes]\nproject = {type = *}",
      after: "[sets]\nproject-pattern = p-*\n[sets.attributes]\nproject-attr = {type = *}",
    },
  },
};

/**
 * Gets error info by code
 */
export function getErrorInfo(code: string): ErrorInfo | undefined {
  return errorCodes[code];
}

/**
 * Formats an error message with fix suggestion
 */
export function formatErrorWithFix(
  code: string,
  lineNumber: number,
  originalMessage: string
): string {
  const info = errorCodes[code];
  if (!info) {
    return `Line ${lineNumber}: ${originalMessage}`;
  }
  return `Line ${lineNumber}: ${info.title} - ${originalMessage}\n\nHow to fix: ${info.fix}`;
}

/**
 * Contextual help text for UI sections
 */
export const helpText = {
  editor: {
    title: "Configuration Editor",
    description: "Write RSES configuration rules to categorize and organize your projects.",
    tips: [
      "Use [section] headers to organize your config",
      "Sets define patterns like 'quantum = quantum-*'",
      "Rules use -> to map conditions to categories",
      "Press Ctrl+S to save your changes",
    ],
  },

  testPlayground: {
    title: "Test Playground",
    description: "Test how filenames are matched and categorized by your configuration.",
    tips: [
      "Enter a filename or path to test",
      "Use paths like 'by-ai/claude/project' to auto-derive attributes",
      "Add manual attributes for testing specific scenarios",
      "Results show matched sets, topics, and types",
    ],
  },

  workbench: {
    title: "Workbench",
    description: "View the parsed configuration and explore its structure.",
    tips: [
      "See how your config is interpreted",
      "Explore sets, rules, and compound definitions",
      "Check for any parsing issues",
    ],
  },

  sections: {
    defaults: "Set default behavior like auto_topic, auto_type, and delimiter.",
    sets: "Define pattern-based sets using glob patterns. Example: 'web = web-*'",
    "sets.attributes": "Define attribute-based sets using {attr = value} syntax.",
    "sets.compound": "Combine sets using boolean expressions: $a & $b | !$c",
    "rules.topic": "Map conditions to topic categories.",
    "rules.type": "Map conditions to type categories.",
    "rules.filetype": "Map file patterns to filetype categories.",
    "overrides.topic": "Override auto-generated topic names.",
    "overrides.type": "Override auto-generated type names.",
    security: "Security-related configuration options.",
  },
};

/**
 * Onboarding step content
 */
export const onboardingSteps = [
  {
    id: "welcome",
    title: "Welcome to RSES Playground",
    description: "RSES (Rule Set Evaluation System) helps you organize projects using pattern-based rules and categories.",
    action: "Let's get started",
  },
  {
    id: "editor",
    title: "The Configuration Editor",
    description: "Write your categorization rules in the editor. Use sections like [sets] to define patterns and [rules.topic] to map them to categories.",
    highlightSelector: "#main-editor",
    action: "Next",
  },
  {
    id: "test",
    title: "Test Your Rules",
    description: "Enter a filename in the Test Playground to see how it gets categorized. Try different names to verify your rules work correctly.",
    highlightSelector: "[data-tab='test']",
    action: "Next",
  },
  {
    id: "finish",
    title: "You're Ready!",
    description: "You now know the basics. Create configurations, test them, and refine your rules. Check the help (?) for more details.",
    action: "Get Started",
  },
];

/**
 * Tooltip content for common UI elements
 */
export const tooltips = {
  saveButton: "Save your configuration (Ctrl+S)",
  newConfig: "Create a new configuration",
  runTest: "Run the test with the current filename",
  validationStatus: {
    valid: "Configuration is valid and ready to use",
    invalid: "Configuration has errors - check the error panel below",
    pending: "Validating your configuration...",
  },
  unsavedChanges: "You have unsaved changes",
};
