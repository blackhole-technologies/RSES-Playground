/**
 * @file validate.ts
 * @description Zod validation middleware for Express routes.
 * @phase Phase 2 - Communication Services
 *
 * Provides reusable middleware for validating request body, query, and params
 * using Zod schemas. Returns structured 400 errors on validation failure.
 */

import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Validates request body against a Zod schema.
 * Replaces req.body with the parsed (and coerced) result on success.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "Validation Error",
          code: "E_VALIDATION",
          details: err.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

/**
 * Validates request query parameters against a Zod schema.
 * Replaces req.query with the parsed result on success.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "Validation Error",
          code: "E_VALIDATION",
          details: err.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

/**
 * Validates request params against a Zod schema.
 * Returns 404 on validation failure (invalid param format = resource not found).
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(404).json({
          error: "Not Found",
          code: "E_NOT_FOUND",
        });
      }
      next(err);
    }
  };
}
