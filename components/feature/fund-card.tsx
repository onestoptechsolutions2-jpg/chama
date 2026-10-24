import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type Summary = {
  deceasedName: string;
  status: string;
  closesOn: string;
  targetKes: number | null;
  giveUrl: string;
  total: number;
  giftCount: number;
  byBranch: { branch: string | null; total: number; count: number }[];
  recent: { name: string; amount: number; message: string | null }[];
};

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;

/** The committee's view of a funeral fund on Home: the total, each family side, and the link to share. */
export function FundCard({ s, canWithdraw }: { s: Summary; canWithdraw: boolean }) {
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Funeral fund for {s.deceasedName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {s.status === "open" ? `Taking gifts until ${s.closesOn}.` : s.status === "converted" ? "Now a family welfare group." : "Closed to new gifts."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="text-3xl font-bold tabular-nums">{ksh(s.total)}</p>
          <p className="text-muted-foreground">
            {s.giftCount} {s.giftCount === 1 ? "gift" : "gifts"}
            {s.targetKes ? ` · target ${ksh(s.targetKes)} (${Math.min(100, Math.round((s.total / s.targetKes) * 100))}%)` : ""}
          </p>
        </div>
        {s.byBranch.length > 0 && (
          <div className="divide-y rounded-md border">
            {s.byBranch.map((b) => (
              <div key={b.branch ?? "-"} className="flex justify-between px-3 py-2">
                <span>{b.branch ?? "Not given"}</span>
                <span className="tabular-nums">
                  {ksh(b.total)} · {b.count}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1">
          <p className="font-medium">Link to share</p>
          <p className="break-all font-mono text-xs">{s.giveUrl}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(`Funeral fund for ${s.deceasedName}: ${s.giveUrl}`)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Share on WhatsApp
          </a>
          {canWithdraw && (
            <Link href="/dashboard/payments" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Wallet &amp; withdrawals
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
