import { fundByToken, fundSummary } from "@/lib/funds/funds";
import { GiveForm } from "@/components/feature/give-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;

/**
 * A funeral fund's public page (the link and QR code families share). Anyone
 * can give by M-Pesa without an account; the total and well-wishers update
 * as payments are confirmed. Per-branch totals are for the committee only,
 * so they are not shown here.
 */
export default async function FundPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fund = await fundByToken(token);
  const s = fund ? await fundSummary(fund.groupId) : null;
  if (!fund || !s) {
    return (
      <main className="mx-auto max-w-md p-4">
        <Card>
          <CardContent className="pt-6 text-muted-foreground">This fund link isn&apos;t valid.</CardContent>
        </Card>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <div className="space-y-1 pt-2 text-center">
        <p className="text-sm text-muted-foreground">In loving memory of</p>
        <h1 className="text-2xl font-bold">{s.deceasedName}</h1>
        <p className="text-sm text-muted-foreground">{s.name}</p>
      </div>
      <Card>
        <CardContent className="space-y-1 pt-6 text-center">
          <p className="text-3xl font-bold tabular-nums">{ksh(s.total)}</p>
          <p className="text-sm text-muted-foreground">
            from {s.giftCount} {s.giftCount === 1 ? "gift" : "gifts"} · {s.status === "open" ? `open until ${s.closesOn}` : "closed"}
          </p>
        </CardContent>
      </Card>
      {s.status === "open" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Give</CardTitle>
            <p className="text-sm text-muted-foreground">
              You&apos;ll get an M-Pesa prompt on your phone. The money goes to the fund&apos;s own wallet; the committee can only send it to the
              family&apos;s account, with two of them agreeing.
            </p>
          </CardHeader>
          <CardContent>
            <GiveForm token={token} branches={s.branches} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">This fund is no longer taking gifts. Thank you to everyone who gave.</CardContent>
        </Card>
      )}
      {s.recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Well-wishers</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {s.recent.map((g, i) => (
              <div key={i} className="flex justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{g.name}</p>
                  {g.message && <p className="text-muted-foreground">{g.message}</p>}
                </div>
                <p className="tabular-nums">{ksh(g.amount)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
