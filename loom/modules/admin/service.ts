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

import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbHandle } from "../../core/db";
import { systemSettings } from "../../core/schema";
import { inviteCodes } from "../auth/schema";

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

// ── Invite codes ──────────────────────────────────────────────────────────

/**
 * Caller-facing projection of an invite_codes row. Field names are
 * camelCased; timestamps are ISO strings.
 */
export interface InviteCodeView {
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  consumedBy: string | null;
  consumedAt: string | null;
}

/**
 * 16 random bytes encoded as base64url is a 22-char URL-safe string —
 * 128 bits of entropy, brute-force-safe with substantial margin, and
 * short enough to fit a "share link" comfortably.
 */
const INVITE_CODE_BYTES = 16;

export const CreateInviteCodeInputSchema = z.object({
  /**
   * Optional ISO-8601 expiry. When omitted the code is non-expiring
   * (admin can still revoke via DELETE).
   */
  expiresAt: z.string().datetime().optional(),
});
export type CreateInviteCodeInput = z.infer<
  typeof CreateInviteCodeInputSchema
>;

function inviteRowToView(row: {
  code: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  consumedBy: string | null;
  consumedAt: Date | null;
}): InviteCodeView {
  return {
    code: row.code,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    consumedBy: row.consumedBy,
    consumedAt: row.consumedAt?.toISOString() ?? null,
  };
}

/**
 * List all invite codes, newest first. No pagination yet — admin
 * volume is small (10s of codes per deploy in normal operation). Add
 * limit/offset when admin UI grows tables that need it.
 */
export async function listInviteCodes(
  handle: DbHandle,
): Promise<InviteCodeView[]> {
  const rows = await handle.db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt));
  return rows.map(inviteRowToView);
}

/**
 * Create a new invite code, generating the random token server-side.
 * `createdBy` must be a real user id — the FK on invite_codes.created_by
 * has ON DELETE CASCADE, so deleting the admin removes their codes.
 *
 * Returns the full row including the raw code; the admin shows this
 * to the recipient (typically via an out-of-band channel like email
 * or chat).
 */
export async function createInviteCode(
  handle: DbHandle,
  createdBy: string,
  input: CreateInviteCodeInput = {},
): Promise<InviteCodeView> {
  const validated = CreateInviteCodeInputSchema.parse(input);
  const code = crypto.randomBytes(INVITE_CODE_BYTES).toString("base64url");
  const expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : null;
  const inserted = await handle.db
    .insert(inviteCodes)
    .values({ code, createdBy, expiresAt })
    .returning();
  return inviteRowToView(inserted[0]);
}

/**
 * Delete an invite code by its raw token. Returns true if a row was
 * removed, false otherwise. Allowed even on consumed codes — the user
 * record's `invite_code_used` field is plain text (no FK to
 * invite_codes), so the audit trail on the user side persists.
 */
export async function deleteInviteCode(
  handle: DbHandle,
  code: string,
): Promise<boolean> {
  const result = await handle.db
    .delete(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .returning({ code: inviteCodes.code });
  return result.length > 0;
}
