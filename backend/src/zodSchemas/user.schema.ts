import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const UserRegistrationSchema = z.object({
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters long")
    .max(50, "First name cannot exceed 50 characters")
    .trim(),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters long")
    .max(50, "Last name cannot exceed 50 characters")
    .trim(),
  email: z
    .email("Invalid email format")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter"),
  role: z
    .nativeEnum(UserRole)
    .default(UserRole.RIDER),

});

// Infer the type from the schema so you don't have to define it twice
export type UserRegistrationInput = z.infer<typeof UserRegistrationSchema>;

export const UserLoginSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    // Optional: add regex for password complexity
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter"),
  role: z
    .nativeEnum(UserRole)
    .default(UserRole.RIDER),

});

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .toLowerCase()
    .trim(),
});

export const ResendVerificationEmailSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .toLowerCase()
    .trim(),
});

export const ResendOtpSchema = z.object({
  email: z
  .string()
    .email("Invalid email format")
    .toLowerCase()
    .trim(),
  password : z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter"),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter"),
});

// Infer the type from the schema so you don't have to define it twice
export type UserLoginInput = z.infer<typeof UserLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResendVerificationEmailInput = z.infer<typeof ResendVerificationEmailSchema>;
export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;