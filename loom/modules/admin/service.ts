/**
 * Admin module service — pure functions over a DbHandle for system
 * settings management.
 *
 * Phase 2 commit 3 introduces just the system_settings surface:
 * getSettings (read-all-the-knobs) and updateSettings (admin-PATCH).
 * Future commits add invite-codes management and feature-flag
 * exposure (which is already storage-ready via
 * engines/feature-flags/storage.ts).
 *
 * Bootstrap-related fields (bootstrap_token_hash,
 * bootstrap_token_consumed_at) are deliberately NOT exposed in
 * SystemSettingsView. The hash leaks would let an attacker who steals
 * an admin session try to brute-force the original token; the
 * consumed_at timestamp is internal state. Admin tooling that needs to
 * inspect bootstrap state should query the DB directly.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DbHandle } from "../../core/db";
import { systemSettings } from "../../core/schema";

export type RegistrationMode = "disabled" | "invite" | "open";

/**
 * Caller-facing projection of system_settings. Excludes secrets
 * (bootstrap_token_hash) and internal-only fields.
 */
export interface SystemSettingsView {
  registrationMode: RegistrationMode;
  defaultRateLimitPerMin: number;
  retentionClassificationLogDays: number;
  retentionSoftDeletedDays: number;
  updatedAt: string;
}

export const UpdateSettingsInputSchema = z
  .object({
    registrationMode: z
      .enum(["disabled", "invite", "open"])
      .optional(),
    defaultRateLimitPerMin: z.number().int().positive().optional(),
    retentionClassificationLogDays: z.number().int().positive().optional(),
    retentionSoftDeletedDays: z.number().int().positive().optional(),
  })
  .refine(
    (input) =>
      Object.values(input).some((v) => v !== undefined),
    { message: "at least one field must be provided" },
  );
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;

export async function getSettings(
  handle: DbHandle,
): Promise<SystemSettingsView> {
  const rows = await handle.db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "default"))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("system_settings row missing — has core_init applied?");
  }
  const row = rows[0];
  return {
    registrationMode: row.registrationMode as RegistrationMode,
    defaultRateLimitPerMin: row.defaultRateLimitPerMin,
    retentionClassificationLogDays: row.retentionClassificationLogDays,
    retentionSoftDeletedDays: row.retentionSoftDeletedDays,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Apply a partial update. Only fields provided in `input` are written;
 * undefined fields keep their current value. Throws ZodError on bad
 * input shape; throws raw pg errors on CHECK violations (e.g. an
 * invalid registration_mode that somehow bypasses Zod — defense in
 * depth via the DB constraint).
 */
export async function updateSettings(
  handle: DbHandle,
  input: UpdateSettingsInput,
): Promise<SystemSettingsView> {
  const validated = UpdateSettingsInputSchema.parse(input);

  const set: Partial<typeof systemSettings.$inferInsert> = {};
  if (validated.registrationMode !== undefined)
    set.registrationMode = validated.registrationMode;
  if (validated.defaultRateLimitPerMin !== undefined)
    set.defaultRateLimitPerMin = validated.defaultRateLimitPerMin;
  if (validated.retentionClassificationLogDays !== undefined)
    set.retentionClassificationLogDays =
      validated.retentionClassificationLogDays;
  if (validated.retentionSoftDeletedDays !== undefined)
    set.retentionSoftDeletedDays = validated.retentionSoftDeletedDays;
  set.updatedAt = new Date();

  await handle.db
    .update(systemSettings)
    .set(set)
    .where(eq(systemSettings.key, "default"));

  return getSettings(handle);
}
