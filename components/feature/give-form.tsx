"use client";

import { useState, useTransition } from "react";
import { giveAction } from "@/app/f/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The public "give" form on a funeral fund page. */
export function GiveForm({ token, branches }: { token: string; branches: string[] }) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: "", phone: "", amount: "", branch: "", message: "", anonymous: false });
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  if (result?.ok) {
    return (
      <div className="space-y-3 text-center">
        <p className="font-medium">Check your phone</p>
        <p className="text-sm text-muted-foreground">Enter your M-Pesa PIN on the prompt. Your gift shows here once it is paid.</p>
        <Button variant="outline" onClick={() => setResult(null)}>
          Give again
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await giveAction(token, { ...f, amount: Number(f.amount), branch: f.branch || null });
          setResult("error" in r ? { ok: false, text: r.error } : { ok: true, text: "" });
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="give-name">Your name</Label>
        <Input id="give-name" value={f.name} onChange={set("name")} maxLength={80} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="give-phone">M-Pesa number</Label>
          <Input id="give-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="07…" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="give-amount">Amount (Ksh)</Label>
          <Input id="give-amount" type="number" inputMode="numeric" min="10" value={f.amount} onChange={set("amount")} required />
        </div>
      </div>
      {branches.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="give-branch">Family side (optional)</Label>
          <select id="give-branch" value={f.branch} onChange={set("branch")} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="give-message">Message (optional)</Label>
        <Input id="give-message" value={f.message} onChange={set("message")} maxLength={140} placeholder="Pole sana" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.anonymous} onChange={set("anonymous")} /> Don&apos;t show my name
      </label>
      {result && !result.ok && <p className="text-sm text-destructive">{result.text}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending prompt…" : "Give by M-Pesa"}
      </Button>
    </form>
  );
}
