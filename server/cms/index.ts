/**
 * @file index.ts
 * @description CMS Content Type System - Server-side module exports
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This module provides a Drupal 11-style content type system for the
 * RSES-Playground CMS, including:
 *
 * - Content types (like Drupal node types)
 * - Field system with storage and instance layers
 * - Display modes for viewing and editing
 * - Taxonomy vocabularies with RSES integration
 * - Content CRUD with field data and revisions
 */

// Storage layer
export * from "./storage";

// Widget and formatter registry
export * from "./registry";

// RSES integration
export * from "./rses-integration";

// Routes
export { default as cmsRoutes } from "./routes";
