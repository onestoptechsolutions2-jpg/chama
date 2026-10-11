import "server-only";

type NovuPayload = {
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
  title: string;
  body: string;
  link: string;
};

/**
 * Hands a notification to Novu, which fans it out to SMS/WhatsApp/email per
 * the "chama-alert" workflow configured in the Novu dashboard. A no-op unless
 * NOVU_API_KEY is set, and never throws — the in-app row is the source of truth.
 */
export async function sendViaNovu(p: NovuPayload): Promise<void> {
  const apiKey = process.env.NOVU_API_KEY;
  if (!apiKey) return;

  const base = process.env.NOVU_API_URL ?? "https://api.novu.co";
  try {
    await fetch(`${base}/v1/events/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `ApiKey ${apiKey}` },
      body: JSON.stringify({
        name: process.env.NOVU_WORKFLOW_ID ?? "chama-alert",
        to: {
          subscriberId: String(p.userId),
          firstName: p.name.split(" ")[0],
          ...(p.email ? { email: p.email } : {}),
          ...(p.phone ? { phone: p.phone } : {}),
        },
        payload: { title: p.title, body: p.body, link: p.link },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("Novu delivery failed", err);
  }
}
