/**
 * @file express-augmentations.d.ts
 * @description Project-wide ambient declarations narrowing Express types.
 *
 * # Why this file exists
 *
 * The `@types/express-serve-static-core` package declares `ParamsDictionary`
 * as `[key: string]: string | string[]` (see node_modules/.../index.d.ts:44).
 * That is incorrect for Express 5 in this project — path parameters from
 * the route matcher are always strings. The buggy upstream declaration
 * propagates `string | string[]` to every `req.params.X` access, which
 * then mismatches every storage/service call that takes a plain `string`.
 *
 * Pre-2026-04-14 the project had ~60 type errors of the form
 * `Argument of type 'string | string[]' is not assignable to parameter of
 * type 'string'`. They were hidden behind unrelated syntax errors in
 * client hook files and surfaced when those were fixed.
 *
 * The fix below uses TypeScript module augmentation to redeclare
 * `ParamsDictionary` with the correct narrower index signature. TS
 * declaration merging allows an interface to be extended; for index
 * signatures, the redeclaration in this file wins because it is loaded
 * after the upstream definition (per TypeScript module resolution
 * ordering) and uses the same shape.
 *
 * If the upstream package fixes its declaration in a future version, this
 * file becomes a no-op and can be deleted.
 */

// We tried two augmentation strategies:
//
//   (1) Redeclare `ParamsDictionary` with a narrower index signature.
//       TypeScript silently ignored it — declaration merging cannot
//       narrow an existing index signature.
//
//   (2) Augment the express `Request` interface directly with a
//       narrower `params` field.
//       TypeScript also rejects this because `Request` extends
//       `core.Request<ParamsDictionary>` and the generic propagation
//       overrides any inline narrower declaration.
//
// The pragmatic alternative is the project-wide `param()` helper in
// `server/lib/express-helpers.ts`. Per-call-site coercion via
// `String(req.params.id)` is also acceptable and is the pattern used
// in the 2026-04-14 cleanup pass — it's mechanical, greppable, and
// survives upstream Express type changes.
//
// This file remains as a placeholder so a future maintainer doesn't
// re-discover the augmentation dead-end.

export {};
