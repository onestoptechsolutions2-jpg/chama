import { z } from "zod";
import { optionalEmail, optionalPhone } from "./identity";

export const createInviteSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    phone: optionalPhone,
    email: optionalEmail,
    role: z.enum(["admin", "treasurer", "secretary", "member"]).default("member"),
    memberId: z.coerce.number().int().positive().optional(),
  })
  .refine((d) => d.phone || d.email, { message: "Enter their phone number", path: ["phone"] });
