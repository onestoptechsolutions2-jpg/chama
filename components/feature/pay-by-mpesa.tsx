"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { payMyselfAction } from "@/app/(dashboard)/dashboard/payments/wallet-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** A member pays the group from their own phone; it records itself when they enter their PIN. */
export function PayByMpesa({ purposes }: { purposes: { value: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const [purpose, setPurpose] = useState(purposes[0]?.value ?? "capital");
  const [amount, setAmount] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pay by M-Pesa</CardTitle>
        <p className="text-sm text-muted-foreground">You&apos;ll get a prompt on your phone. Enter your PIN and it shows here by itself.</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="For">
          {purposes.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <Input type="number" inputMode="numeric" min="10" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ksh" className="w-28" />
        <Button
          disabled={pending || !(Number(amount) >= 10)}
          onClick={() =>
            start(async () => {
              const r = await payMyselfAction(purpose, Number(amount));
              if ("error" in r) toast.error(r.error);
              else {
                toast.success(r.message ?? "Check your phone");
                setAmount("");
              }
            })
          }
        >
          {pending ? "Sending…" : "Send prompt"}
        </Button>
      </CardContent>
    </Card>
  );
}
