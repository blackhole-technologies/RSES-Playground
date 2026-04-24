/**
 * Shared types for the RSES engine.
 *
 * Extracted from the parent repo's shared/schema.ts so this salvage
 * directory has no imports outside itself.
 */

export interface ValidationError {
  line: number;
  message: string;
  code: string; // E001, E002, etc.
}
