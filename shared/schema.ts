import { pgTable, text, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === Users Table (Phase 1 - Security Hardening) ===

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: text("email").unique(),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
  passwordHash: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Omit sensitive fields for API responses
export type SafeUser = Omit<User, "passwordHash">;

// === Configs Table ===

export const configs = pgTable("configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  userId: integer("user_id").references(() => users.id),
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

// === Projects Table (Phase 6 - CMS Features) ===

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  name: text("name").notNull(),
  markers: jsonb("markers").$type<string[]>().default([]),
  classification: jsonb("classification").$type<{
    sets: string[];
    topics: string[];
    types: string[];
  }>(),
  attributes: jsonb("attributes").$type<Record<string, string>>(),
  status: text("status").$type<"linked" | "unlinked" | "pending">().default("pending").notNull(),
  linkPath: text("link_path"),
  configId: integer("config_id").references(() => configs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  linkedAt: timestamp("linked_at"),
  lastScannedAt: timestamp("last_scanned_at"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["linked", "unlinked", "pending"]).optional(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

// === Config Versions Table (Phase 6 - CMS Features) ===

export const configVersions = pgTable("config_versions", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => configs.id).notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertConfigVersionSchema = createInsertSchema(configVersions).omit({
  id: true,
  version: true, // Auto-computed by storage layer
  createdAt: true,
});

export type ConfigVersion = typeof configVersions.$inferSelect;
export type InsertConfigVersion = z.infer<typeof insertConfigVersionSchema>;

// === Activity Log Table (Phase 6 - CMS Features) ===

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // e.g., "config.created", "project.linked"
  entityType: text("entity_type").notNull(), // "config", "project", "user"
  entityId: integer("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type InsertActivityLogEntry = z.infer<typeof insertActivityLogSchema>;

// === Module Configs Table (Phase 6 - Kernel Config Persistence) ===

export const moduleConfigs = pgTable("module_configs", {
  id: serial("id").primaryKey(),
  moduleId: text("module_id").notNull().unique(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertModuleConfigSchema = createInsertSchema(moduleConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ModuleConfig = typeof moduleConfigs.$inferSelect;
export type InsertModuleConfig = z.infer<typeof insertModuleConfigSchema>;
