import { z } from "zod";
import { optionalEmail, optionalPhone } from "./identity";

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: optionalEmail,
    phone: optionalPhone,
    password: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.email || data.phone, {
    message: "Email or phone is required",
    path: ["email"],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or phone is required"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
