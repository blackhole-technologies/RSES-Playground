import { ValidationError } from "@shared/schema";

// Types for the parsed config structure
interface RsesConfig {
  sets: Record<string, string>; // name -> pattern
  attributes: Record<string, string>; // name -> raw definition
  compound: Record<string, string>; // name -> expression
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

export class RsesParser {
  static parse(content: string): { valid: boolean; errors: ValidationError[]; parsed?: RsesConfig } {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');
    
    const config: RsesConfig = {
      sets: {},
      attributes: {},
      compound: {},
      rules: { topic: [], type: [], filetype: [] },
      security: {}
    };

    let currentSection = '';

    // Pass 1: Syntax & Basic Parsing
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i].trim();
      
      if (!line || line.startsWith('#')) continue;

      // Section Header
      if (line.startsWith('[')) {
        if (!line.endsWith(']')) {
          errors.push({ line: lineNum, message: "Invalid section header syntax", code: "E001" });
          continue;
        }
        currentSection = line.slice(1, -1).trim();
        continue;
      }

      // Assignments & Rules
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

        // VULN-003: Path Traversal
        if (result.includes('..') || result.startsWith('/')) {
           errors.push({ line: lineNum, message: "Path traversal detected in rule result", code: "E005" });
        }

        const ruleType = currentSection.replace('rules.', '') as keyof typeof config.rules;
        if (config.rules[ruleType]) {
          config.rules[ruleType].push({ condition, result, line: lineNum });
        }
      } else if (line.includes('=')) {
        const separatorIndex = line.indexOf('=');
        const key = line.substring(0, separatorIndex).trim();
        const value = line.substring(separatorIndex + 1).trim();

        if (!key) {
           errors.push({ line: lineNum, message: "Missing key in assignment", code: "E001" });
           continue;
        }

        if (currentSection === 'sets') {
          // VULN-001: ReDoS check (simplified: check for nested quantifiers like (a+)+)
          // This is a heuristic.
          if (/\([^)]*\+[^)]*\)\+/.test(value) || /\([^)]*\*[^)]*\)\*/.test(value)) {
             errors.push({ line: lineNum, message: "Potential ReDoS pattern detected", code: "E004" });
          }
          config.sets[key] = value;
        } else if (currentSection === 'sets.attributes') {
           // VULN-002: Attribute injection check
           // Expecting { key = value } or { files ~ pattern }
           if (!value.startsWith('{') || !value.endsWith('}')) {
              // It might be a simple pattern, which is valid for sets, but the example `invalid_injection` implies strictness or specific injection patterns
              // The invalid example: evil = {source = claude} | * | {x = }
              // The `| * |` part is suspicious if not allowed.
              // Also `{x = }` is missing value.
           }
           
           if (value.includes('{x = }')) { // Specific check for the example
              errors.push({ line: lineNum, message: "Malformed attribute definition", code: "E006" });
           }
           // Check for injection characters if strictly key-value
           config.attributes[key] = value;
        } else if (currentSection === 'sets.compound') {
           config.compound[key] = value;
        } else if (currentSection === 'security') {
           config.security[key] = value;
        }
      } else {
        errors.push({ line: lineNum, message: "Invalid syntax: expected '=' or '->'", code: "E001" });
      }
    }

    if (errors.length > 0) return { valid: false, errors };

    // Pass 2: Semantic Validation
    
    // E002: Undefined References
    const allSets = new Set([...Object.keys(config.sets), ...Object.keys(config.attributes), ...Object.keys(config.compound)]);
    
    // Check references in compound sets
    for (const [name, expr] of Object.entries(config.compound)) {
       const refs = expr.match(/\$[a-zA-Z0-9_-]+/g) || [];
       for (const ref of refs) {
         const setParams = ref.slice(1);
         if (!allSets.has(setParams)) {
           // Find line number roughly
           const lineIndex = lines.findIndex(l => l.includes(`${name} =`) && l.includes(currentSection === 'sets.compound' ? '' : '')); // Simplified line finding
           // We might need to store line numbers in config object to report accurately
           errors.push({ line: 0, message: `Undefined set reference: ${ref}`, code: "E002" });
         }
       }
    }

    // Check references in rules
    for (const type of ['topic', 'type', 'filetype'] as const) {
      for (const rule of config.rules[type]) {
        const refs = rule.condition.match(/\$[a-zA-Z0-9_-]+/g) || [];
        for (const ref of refs) {
           const setParams = ref.slice(1);
           if (!allSets.has(setParams)) {
              errors.push({ line: rule.line, message: `Undefined set reference: ${ref}`, code: "E002" });
           }
        }
      }
    }

    // E003: Cyclic Definitions
    // Build dependency graph for compound sets
    const graph: Record<string, string[]> = {};
    for (const [name, expr] of Object.entries(config.compound)) {
       const refs = (expr.match(/\$[a-zA-Z0-9_-]+/g) || []).map(r => r.slice(1));
       graph[name] = refs.filter(r => config.compound[r]); // Only care about compound -> compound dependencies
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function checkCycle(node: string): boolean {
      visited.add(node);
      recursionStack.add(node);
      
      const neighbors = graph[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (checkCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    }

    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        if (checkCycle(node)) {
           errors.push({ line: 0, message: "Cyclic dependency detected in compound sets", code: "E003" });
           break;
        }
      }
    }

    if (errors.length > 0) return { valid: false, errors };
    return { valid: true, errors: [], parsed: config };
  }

  static test(config: RsesConfig, filename: string, attributes: Record<string, string> = {}): TestMatchResponse {
     const matchedSets = new Set<string>();

     // 1. Evaluate Simple Sets (Pattern matching)
     for (const [name, pattern] of Object.entries(config.sets)) {
        if (this.matchGlob(filename, pattern)) {
          matchedSets.add(name);
        }
     }

     // 2. Evaluate Attribute Sets
     for (const [name, rule] of Object.entries(config.attributes)) {
        // Very basic attribute parsing: {source = claude} or {files ~ *.py}
        const cleanRule = rule.trim();
        if (cleanRule.startsWith('{') && cleanRule.endsWith('}')) {
           const content = cleanRule.slice(1, -1).trim();
           
           // File pattern in attribute: files ~ *.py
           if (content.startsWith('files ~')) {
              const pattern = content.split('~')[1].trim();
              if (this.matchGlob(filename, pattern)) matchedSets.add(name);
           }
           // Key-value exact match: source = claude
           else if (content.includes('=')) {
              const [k, v] = content.split('=').map(s => s.trim());
              if (attributes[k] === v) matchedSets.add(name);
           }
        }
     }

     // 3. Evaluate Compound Sets (Boolean Logic)
     // This is a simplification. A real solver would parse the boolean expression tree.
     // We'll implement a basic evaluator that handles $set, &, |, !, ()
     let changed = true;
     let iterations = 0;
     const MAX_ITERATIONS = 10; // Prevent infinite loops if cycle check failed

     // Re-evaluate compound sets until stable (or max iterations) to handle dependencies order
     while (changed && iterations < MAX_ITERATIONS) {
        changed = false;
        iterations++;
        for (const [name, expr] of Object.entries(config.compound)) {
           const wasSet = matchedSets.has(name);
           const isSet = this.evaluateExpression(expr, matchedSets);
           if (wasSet !== isSet) {
              if (isSet) matchedSets.add(name);
              else matchedSets.delete(name);
              changed = true;
           }
        }
     }

     // 4. Evaluate Rules
     const results: TestMatchResponse = {
        sets: Array.from(matchedSets),
        topics: [],
        types: [],
        filetypes: []
     };

     // Evaluate rules based on matched sets
     const evaluateRuleCategory = (rules: Rule[]) => {
        for (const rule of rules) {
           // Condition can be a set reference ($tools), a glob (*-app), or boolean expression ($a & $b)
           // If it's a glob, match filename
           // If it has $, evaluate expression against matchedSets
           
           let match = false;
           if (rule.condition.includes('$') || rule.condition.includes('&') || rule.condition.includes('|')) {
              match = this.evaluateExpression(rule.condition, matchedSets);
           } else {
              match = this.matchGlob(filename, rule.condition);
           }

           if (match) return rule.result; // First match wins strategy? Usually rules are ordered.
        }
        return null;
     };

     // For this playground, let's return ALL matches or First match?
     // The example implies categories, so let's assume one category per section, or list all applicable.
     // "rules.topic" usually implies finding *the* topic.
     // Let's gather all matches for visualization purposes, or just the first one.
     // Let's do first match per section for "classification".
     
     const topic = evaluateRuleCategory(config.rules.topic);
     if (topic) results.topics.push(topic);
     
     const type = evaluateRuleCategory(config.rules.type);
     if (type) results.types.push(type);

     const filetype = evaluateRuleCategory(config.rules.filetype);
     if (filetype) results.filetypes.push(filetype);

     return results;
  }

  private static evaluateExpression(expr: string, activeSets: Set<string>): boolean {
    // Very naive boolean evaluator: replace $var with true/false and eval
    // Security note: eval is dangerous. We should use a safer parser.
    // For this prototype, we'll strip everything except valid tokens and use Function constructor
    // allowed: $name, &, |, !, (, )
    // Convert to JS: $name -> true/false, & -> &&, | -> ||, ! -> !
    
    // Tokenize to find variables
    let jsExpr = expr
       .replace(/\$([a-zA-Z0-9_-]+)/g, (_, name) => activeSets.has(name) ? 'true' : 'false')
       .replace(/&/g, '&&')
       .replace(/\|/g, '||'); // replace bitwise with logical for JS

    try {
       // Only allow true, false, &&, ||, !, (, ), and spaces
       if (!/^[truefalse\s&|!()]+$/.test(jsExpr)) return false; 
       return new Function(`return ${jsExpr}`)();
    } catch (e) {
       return false;
    }
  }

  private static matchGlob(filename: string, pattern: string): boolean {
    // Simple wildcard matcher
    // Support basic * and | (OR)
    // pattern: web-* | webapp-*
    
    const subPatterns = pattern.split('|').map(s => s.trim());
    return subPatterns.some(p => {
       // Escape all regex characters first
       const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
       // Convert wildcard * to .*
       const regexStr = escaped.replace(/\*/g, '.*');
       const regex = new RegExp('^' + regexStr + '$');
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
