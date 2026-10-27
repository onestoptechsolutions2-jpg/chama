import "server-only";
import nodemailer from "nodemailer";

/**
 * Email through the platform's own SMTP mailbox (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASSWORD, SMTP_FROM). Off unless host and from are set —
 * callers check emailEnabled() and fall back to in-app delivery.
 */
export function emailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
    });
  }
  return transport;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<void> {
  await getTransport().sendMail({ from: process.env.SMTP_FROM, ...input });
}
