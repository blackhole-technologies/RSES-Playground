import { ValidationError } from "@shared/schema";

interface RsesConfig {
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

export class RsesParser {
  static parse(content: string): { valid: boolean; errors: ValidationError[]; parsed?: RsesConfig } {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');
    
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

        if (currentSection === 'defaults') {
          (config.defaults as any)[key] = value;
        } else if (currentSection === 'overrides.topic') {
          config.overrides.topic[key] = value;
        } else if (currentSection === 'overrides.type') {
          config.overrides.type[key] = value;
        } else if (currentSection === 'sets') {
          if (/\([^)]*\+[^)]*\)\+/.test(value)) {
             errors.push({ line: lineNum, message: "Potential ReDoS pattern detected", code: "E004" });
          }
          config.sets[key] = value;
        } else if (currentSection === 'sets.attributes') {
           if (value.includes('{x = }')) {
              errors.push({ line: lineNum, message: "Malformed attribute definition", code: "E006" });
           }
           config.attributes[key] = value;
        } else if (currentSection === 'sets.compound') {
           config.compound[key] = value;
        } else if (currentSection === 'security') {
           config.security[key] = value;
        }
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

     for (const [name, pattern] of Object.entries(config.sets)) {
        if (this.matchGlob(filename, pattern)) matchedSets.add(name);
     }

     for (const [name, expr] of Object.entries(config.compound)) {
        if (this.evaluateExpression(expr, matchedSets)) matchedSets.add(name);
     }

     const results: TestMatchResponse = {
        sets: Array.from(matchedSets),
        topics: [],
        types: [],
        filetypes: []
     };

     const resolveCategory = (type: 'topic' | 'type', extracted: string, rules: Rule[]) => {
        for (const rule of rules) {
           if (this.evaluateExpression(rule.condition, matchedSets) || this.matchGlob(filename, rule.condition)) {
              return rule.result;
           }
        }
        const override = config.overrides[type][extracted];
        if (override) return override;
        if (config.defaults[`auto_${type}` as keyof typeof config.defaults] !== "false") {
           return extracted || null;
        }
        return null;
     };

     const topic = resolveCategory('topic', prefix, config.rules.topic);
     if (topic) results.topics.push(topic);

     const type = resolveCategory('type', suffix, config.rules.type);
     if (type) results.types.push(type);

     for (const rule of config.rules.filetype) {
        if (this.matchGlob(filename, rule.condition)) {
           results.filetypes.push(rule.result);
           break;
        }
     }

     return results;
  }

  private static evaluateExpression(expr: string, activeSets: Set<string>): boolean {
    if (!expr.includes('$')) return false;
    let jsExpr = expr
       .replace(/\$([a-zA-Z0-9_-]+)/g, (_, name) => activeSets.has(name) ? 'true' : 'false')
       .replace(/&/g, '&&')
       .replace(/\|/g, '||');
    try {
       if (!/^[truefalse\s&|!()]+$/.test(jsExpr)) return false;
       return new Function(`return ${jsExpr}`)();
    } catch {
       return false;
    }
  }

  private static matchGlob(filename: string, pattern: string): boolean {
    const subPatterns = pattern.split('|').map(s => s.trim());
    return subPatterns.some(p => {
       const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
       const regexStr = escaped.replace(/\\\*/g, '.*');
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
