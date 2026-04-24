/**
 * Type shapes borrowed from the RSES engine.
 *
 * Duplicated here so this salvage unit is self-contained. If you're using
 * this alongside `01-rses-engine/`, delete this file and import the same
 * types from that unit's `./rses` and `./types` modules.
 */

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

export interface TestMatchResponse {
  sets: string[];
  topics: string[];
  types: string[];
  filetypes: string[];
}
