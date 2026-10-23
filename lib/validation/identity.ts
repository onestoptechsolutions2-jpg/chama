import { z } from "zod";
import { normalizeEmail, normalizePhone } from "@/lib/domain/identity";

const PHONE_MESSAGE = "Enter a Kenyan mobile number, e.g. 0712 345 678";

/** Optional phone: "" → undefined; anything else must be a valid Kenyan mobile, stored canonical. */
export const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });

/** Required phone, stored canonical. */
export const requiredPhone = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });

/** Optional email: "" → undefined, else a valid email, lowercased. */
export const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    if (!z.string().email().safeParse(v).success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
      return z.NEVER;
    }
    return normalizeEmail(v) ?? undefined;
  });
