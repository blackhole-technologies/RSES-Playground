import { ValidationError } from "@shared/schema";
import { safeEvaluate, validateExpression } from "./boolean-parser";
import { validateCompoundSets, getEvaluationOrder } from "./cycle-detector";
import { getGlobalCache } from "./regex-cache";
import { validateSetPattern, checkReDoS } from "./redos-checker";

export interface RsesConfig {
  defaults: {
    auto_topic: string;
    auto_type: string;
    delimiter: string;
  };
  overrides: {
    topic: Record<string, string>;
    type: Record<string, string>;
  };
  sets: Record<string, string>;
  attributes: Record<string, string>;
  compound: Record<string, string>;
  rules: {
    topic: Rule[];
    type: Rule[];
    filetype: Rule[];
  };
  security: Record<string, string>;
}

interface Rule {
  condition: string;
  result: string;
  line: number;
}

// Extract attributes from path structure (e.g., by-ai/claude/project → source=claude)
export function deriveAttributesFromPath(filepath: string): Record<string, string> {
  const parts = filepath.split('/').filter(Boolean);
  const derived: Record<string, string> = {};

  // Pattern: by-ai/{source}/{project}
  if (parts[0] === 'by-ai' && parts.length >= 2) {
    derived.source = parts[1]; // claude, chatgpt, gemini, cursor
  }

  return derived;
}

// Replace $varname with captured attribute values
export function resolveRuleResult(template: string, attrs: Record<string, string>): string {
  return template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) =>
    attrs[name] !== undefined ? attrs[name] : `$${name}`
  );
}

/**
 * Symbol namespace types for collision detection.
 * Each set type occupies its own namespace but all are referenced with $name.
 */
type SymbolNamespace = 'pattern' | 'attribute' | 'compound';

interface SymbolRegistry {
  name: string;
  namespace: SymbolNamespace;
  line: number;
}

export class RsesParser {
  static parse(content: string): { valid: boolean; errors: ValidationError[]; parsed?: RsesConfig } {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');

    // Symbol registry for collision detection
    const symbolRegistry: Map<string, SymbolRegistry> = new Map();

    const config: RsesConfig = {
      defaults: { auto_topic: "false", auto_type: "false", delimiter: "-" },
      overrides: { topic: {}, type: {} },
      sets: {},
      attributes: {},
      compound: {},
      rules: { topic: [], type: [], filetype: [] },
      security: {}
    };

    let currentSection = '';

    /**
     * Registers a symbol and checks for namespace collisions.
     * @returns true if registration succeeded, false if collision detected
     */
    const registerSymbol = (name: string, namespace: SymbolNamespace, line: number): boolean => {
      const existing = symbolRegistry.get(name);
      if (existing) {
        const namespaceLabels: Record<SymbolNamespace, string> = {
          pattern: '[sets]',
          attribute: '[sets.attributes]',
          compound: '[sets.compound]'
        };
        errors.push({
          line,
          message: `Symbol collision: '${name}' already defined as ${namespaceLabels[existing.namespace]} set on line ${existing.line}`,
          code: "E009"
        });
        return false;
      }
      symbolRegistry.set(name, { name, namespace, line });
      return true;
    };

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i].trim();
      
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('[')) {
        if (!line.endsWith(']')) {
          errors.push({ line: lineNum, message: "Invalid section header syntax", code: "E001" });
          continue;
        }
        currentSection = line.slice(1, -1).trim();
        continue;
      }

      if (currentSection.startsWith('rules.')) {
        if (!line.includes('->')) {
           errors.push({ line: lineNum, message: "Rule must use '->' syntax", code: "E001" });
           continue;
        }
        const [condition, result] = line.split('->').map(s => s.trim());
        if (!condition || !result) {
          errors.push({ line: lineNum, message: "Empty condition or result in rule", code: "E001" });
          continue;
        }
        // Block (not just warn) path traversal attempts
        if (result.includes('..') || result.startsWith('/') || /^[a-zA-Z]:/.test(result)) {
           errors.push({ line: lineNum, message: "Path traversal detected in rule result - rule blocked", code: "E005" });
           continue; // Skip adding this dangerous rule
        }
        const ruleType = currentSection.replace('rules.', '') as keyof typeof config.rules;
        if (config.rules[ruleType]) {
          config.rules[ruleType].push({ condition, result, line: lineNum });
        }
      } else if (line.includes('=')) {
        const separatorIndex = line.indexOf('=');
        const key = line.substring(0, separatorIndex).trim();
        const value = line.substring(separatorIndex + 1).trim();

        if (currentSection === 'defaults') {
          (config.defaults as any)[key] = value;
        } else if (currentSection === 'overrides.topic') {
          // Block path traversal in overrides
          if (value.includes('..') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) {
            errors.push({ line: lineNum, message: "Path traversal detected in topic override - blocked", code: "E005" });
            continue;
          }
          config.overrides.topic[key] = value;
        } else if (currentSection === 'overrides.type') {
          // Block path traversal in overrides
          if (value.includes('..') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) {
            errors.push({ line: lineNum, message: "Path traversal detected in type override - blocked", code: "E005" });
            continue;
          }
          config.overrides.type[key] = value;
        } else if (currentSection === 'sets') {
          // Comprehensive ReDoS pattern validation
          const patternValidation = validateSetPattern(value);
          if (!patternValidation.valid) {
            errors.push({
              line: lineNum,
              message: `Unsafe pattern: ${patternValidation.error}`,
              code: "E004"
            });
            continue; // Skip adding dangerous patterns
          }
          // Register symbol and check for collisions
          if (!registerSymbol(key, 'pattern', lineNum)) {
            continue; // Skip if collision detected
          }
          config.sets[key] = value;
        } else if (currentSection === 'sets.attributes') {
           if (value.includes('{x = }')) {
              errors.push({ line: lineNum, message: "Malformed attribute definition", code: "E006" });
           }
           // Register symbol and check for collisions
           if (!registerSymbol(key, 'attribute', lineNum)) {
             continue; // Skip if collision detected
           }
           config.attributes[key] = value;
        } else if (currentSection === 'sets.compound') {
           // Validate compound set expression syntax
           const validation = validateExpression(value);
           if (!validation.valid && validation.error) {
             errors.push({
               line: lineNum,
               message: `Invalid compound expression: ${validation.error.message}`,
               code: "E007"
             });
           }
           // Register symbol and check for collisions
           if (!registerSymbol(key, 'compound', lineNum)) {
             continue; // Skip if collision detected
           }
           config.compound[key] = value;
        } else if (currentSection === 'security') {
           config.security[key] = value;
        }
      }
    }

    // Validate compound sets for cycles before returning
    if (Object.keys(config.compound).length > 0) {
      const cycleValidation = validateCompoundSets(config.compound);
      if (!cycleValidation.valid && cycleValidation.error) {
        errors.push({
          line: 0, // Cycle involves multiple lines
          message: cycleValidation.error.message,
          code: "E008"
        });
      }
    }

    if (errors.length > 0) return { valid: false, errors };
    return { valid: true, errors: [], parsed: config };
  }

  static test(config: RsesConfig, filename: string, attributes: Record<string, string> = {}): TestMatchResponse {
     const matchedSets = new Set<string>();
     const delimiter = config.defaults.delimiter || "-";
     const segments = filename.split(delimiter);
     const prefix = segments[0];
     const suffix = segments.length > 1 ? segments[segments.length - 1] : "";

     // Pattern-based set matching
     for (const [name, pattern] of Object.entries(config.sets)) {
        if (this.matchGlob(filename, pattern)) matchedSets.add(name);
     }

     // Attribute-based set matching
     for (const [name, pattern] of Object.entries(config.attributes)) {
        // Parse {attr = value} pattern
        const match = pattern.match(/\{(\w+)\s*=\s*([^}]+)\}/);
        if (match) {
          const [, attr, value] = match;
          const attrValue = attributes[attr];
          const trimmedValue = value.trim();

          if (trimmedValue === '*') {
            // Wildcard: match if attribute exists
            if (attrValue !== undefined) matchedSets.add(name);
          } else if (attrValue === trimmedValue) {
            // Exact match
            matchedSets.add(name);
          }
        }
     }

     // Compound set evaluation (in topological order to handle dependencies)
     const evalOrder = getEvaluationOrder(config.compound);
     if (evalOrder) {
       for (const name of evalOrder) {
         const expr = config.compound[name];
         if (expr && this.evaluateExpression(expr, matchedSets)) {
           matchedSets.add(name);
         }
       }
     } else {
       // Fallback: evaluate in definition order (cycles should have been caught at parse time)
       for (const [name, expr] of Object.entries(config.compound)) {
         if (this.evaluateExpression(expr, matchedSets)) matchedSets.add(name);
       }
     }

     const results: TestMatchResponse = {
        sets: Array.from(matchedSets),
        topics: [],
        types: [],
        filetypes: []
     };

     // Helper to check if a rule condition matches
     const ruleMatches = (condition: string): boolean => {
        // Check for attribute condition like {source = *} or {source = claude}
        const attrMatch = condition.match(/\{(\w+)\s*=\s*([^}]+)\}/);
        if (attrMatch) {
          const [, attr, value] = attrMatch;
          const attrValue = attributes[attr];
          const trimmedValue = value.trim();

          if (trimmedValue === '*') {
            return attrValue !== undefined;
          }
          return attrValue === trimmedValue;
        }
        // Check for set expression or glob pattern
        return this.evaluateExpression(condition, matchedSets) || this.matchGlob(filename, condition);
     };

     const resolveCategory = (type: 'topic' | 'type', extracted: string, rules: Rule[]) => {
        const results: string[] = [];
        for (const rule of rules) {
           if (ruleMatches(rule.condition)) {
              // Apply variable substitution
              const resolved = resolveRuleResult(rule.result, attributes);
              results.push(resolved);
           }
        }
        if (results.length > 0) return results;

        const override = config.overrides[type][extracted];
        if (override) return [override];
        if (config.defaults[`auto_${type}` as keyof typeof config.defaults] !== "false") {
           return extracted ? [extracted] : [];
        }
        return [];
     };

     results.topics = resolveCategory('topic', prefix, config.rules.topic);
     results.types = resolveCategory('type', suffix, config.rules.type);

     for (const rule of config.rules.filetype) {
        if (this.matchGlob(filename, rule.condition)) {
           results.filetypes.push(rule.result);
           break;
        }
     }

     return results;
  }

  /**
   * Evaluates a Boolean expression against active sets using a safe recursive descent parser.
   * Replaced unsafe `new Function()` call with safe parser implementation.
   *
   * @security This method no longer uses dynamic code execution.
   * @param expr - Expression like "$set1 & $set2" or "$a | ($b & $c)"
   * @param activeSets - Set of set names that are currently true
   * @returns boolean result of the expression
   */
  private static evaluateExpression(expr: string, activeSets: Set<string>): boolean {
    if (!expr.includes('$')) return false;
    return safeEvaluate(expr, activeSets);
  }

  /**
   * Matches a filename against a glob pattern using cached regex.
   * Uses global regex cache to avoid recompiling patterns.
   *
   * @param filename - Filename to match
   * @param pattern - Glob pattern (supports * wildcard and | for OR)
   * @returns True if filename matches the pattern
   */
  private static matchGlob(filename: string, pattern: string): boolean {
    const cache = getGlobalCache();
    const subPatterns = pattern.split('|').map(s => s.trim());
    return subPatterns.some(p => {
       const regex = cache.getGlobRegex(p);
       return regex.test(filename);
    });
  }
}

export interface TestMatchResponse {
  sets: string[];
  topics: string[];
  types: string[];
  filetypes: string[];
}
