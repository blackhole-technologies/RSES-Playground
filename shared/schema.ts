import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const configs = pgTable("configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConfigSchema = createInsertSchema(configs).omit({ id: true, createdAt: true });

export type Config = typeof configs.$inferSelect;
export type InsertConfig = z.infer<typeof insertConfigSchema>;

// === API Types ===

export interface ValidationRequest {
  content: string;
}

export interface ValidationError {
  line: number;
  message: string;
  code: string; // E001, E002, etc.
}

export interface ValidationResponse {
  valid: boolean;
  errors: ValidationError[];
  parsed?: any; // The AST or processed rules if valid
}

export interface TestMatchRequest {
  configContent: string;
  filename: string;
  attributes?: Record<string, string>;
}

export interface TestMatchResponse {
  sets: string[];
  topics: string[];
  types: string[];
  filetypes: string[];
}
