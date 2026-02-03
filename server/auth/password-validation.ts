/**
 * @file password-validation.ts
 * @description Password complexity validation for MEDIUM-004 security fix
 * @phase Phase 1 - Security Hardening
 * @version 1.0.0
 * @created 2026-02-03
 */

import { z } from "zod";

// Top 100 common passwords list (case-insensitive matching)
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123",
  "monkey", "1234567", "letmein", "trustno1", "dragon",
  "baseball", "iloveyou", "master", "sunshine", "ashley",
  "bailey", "passw0rd", "shadow", "123123", "654321",
  "superman", "qazwsx", "michael", "football", "password1",
  "password123", "batman", "login", "admin", "welcome",
  "hello", "charlie", "donald", "loveme", "soccer",
  "princess", "starwars", "freedom", "whatever", "qwerty123",
  "access", "ninja", "mustang", "111111", "000000",
  "696969", "1qaz2wsx", "pepper", "123abc", "winter",
  "summer", "spring", "autumn", "pokemon", "killer",
  "zaq12wsx", "flower", "hottie", "lovely", "loveyou",
  "test123", "cheese", "cookie", "banana", "matrix",
  "internet", "hunter", "12345", "1234", "123",
  "pass", "guest", "root", "server", "change",
  "changeme", "changeit", "default", "welcome1", "welcome123",
  "admin123", "test", "test1", "password2", "password3",
  "11111111", "99999999", "qwerty1", "asdfgh", "asdf1234",
  "zxcvbn", "zxcvbnm", "1q2w3e4r", "q1w2e3r4", "1234qwer",
  "qwer1234", "jordan", "harley", "robert", "thomas",
]);

/**
 * Password complexity validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password complexity requirements:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * - Not in common passwords list
 * 
 * @param password - Password to validate
 * @returns Validation result with any errors
 */
export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const errors: string[] = [];

  // Length checks
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (password.length > 128) {
    errors.push("Password must be less than 128 characters");
  }

  // Complexity checks
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;':\",./<>?`~)");
  }

  // Common password check (case-insensitive)
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("Password is too common. Please choose a more unique password");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Zod schema for password with complexity validation.
 * Use this in place of simple z.string() for password fields.
 */
export const passwordComplexitySchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .refine(
    (password) => /[A-Z]/.test(password),
    "Password must contain at least one uppercase letter"
  )
  .refine(
    (password) => /[a-z]/.test(password),
    "Password must contain at least one lowercase letter"
  )
  .refine(
    (password) => /[0-9]/.test(password),
    "Password must contain at least one number"
  )
  .refine(
    (password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password),
    "Password must contain at least one special character"
  )
  .refine(
    (password) => !COMMON_PASSWORDS.has(password.toLowerCase()),
    "Password is too common. Please choose a more unique password"
  );

/**
 * Optional password schema for update operations.
 * Applies complexity validation only if password is provided.
 */
export const optionalPasswordComplexitySchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .refine(
    (password) => /[A-Z]/.test(password),
    "Password must contain at least one uppercase letter"
  )
  .refine(
    (password) => /[a-z]/.test(password),
    "Password must contain at least one lowercase letter"
  )
  .refine(
    (password) => /[0-9]/.test(password),
    "Password must contain at least one number"
  )
  .refine(
    (password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password),
    "Password must contain at least one special character"
  )
  .refine(
    (password) => !COMMON_PASSWORDS.has(password.toLowerCase()),
    "Password is too common. Please choose a more unique password"
  )
  .optional();
