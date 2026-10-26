"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mergeUsersAction } from "@/app/super-admin/users/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayPhone } from "@/lib/domain/identity";
import { previewMerge, searchAccounts, type MergeCandidate } from "@/lib/domain/merge-preview";

function describe(u: MergeCandidate) {
  return [u.email, u.phone ? displayPhone(u.phone) : null].filter(Boolean).join(" · ");
}

function AccountPicker({
  label,
  id,
  candidates,
  selected,
  onSelect,
}: {
  label: string;
  id: string;
  candidates: MergeCandidate[];
  selected: MergeCandidate | null;
  onSelect: (u: MergeCandidate | null) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchAccounts(candidates, query), [candidates, query]);

  if (selected) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
          <div>
            <span className="font-medium">{selected.name}</span> <span className="text-muted-foreground">#{selected.id}</span>
            <div className="text-muted-foreground">{describe(selected) || "no email or phone"}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onSelect(null)}>Change</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} placeholder="Name, email, phone or #id" value={query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim() && (
        <ul className="divide-y rounded-lg border text-sm">
          {matches.length === 0 && <li className="p-2 text-muted-foreground">No account found</li>}
          {matches.map((u) => (
            <li key={u.id}>
              <button type="button" className="w-full p-2 text-left hover:bg-muted" onClick={() => { onSelect(u); setQuery(""); }}>
                <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">#{u.id}</span>
                <span className="block text-muted-foreground">{describe(u)}{u.active ? "" : " · deactivated"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const roleLabel = (m: { role: string; status: string } | null) => (m ? `${m.role === "admin" ? "admin (Chair)" : m.role}${m.status === "active" ? "" : `, ${m.status}`}` : "—");

/**
 * Super admin > Users: fold one account into another when one person has two logins. Owners only (the page
 * renders it only for them, and mergeUsersAction checks again). The merge itself is the existing
 * mergeUsersAction, unchanged; this box only picks the two accounts, previews the result and confirms.
 */
export function MergeAccountsBox({ candidates }: { candidates: MergeCandidate[] }) {
  const router = useRouter();
  const [keep, setKeep] = useState<MergeCandidate | null>(null);
  const [foldIn, setFoldIn] = useState<MergeCandidate | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const preview = keep && foldIn ? previewMerge(keep, foldIn) : null;

  function confirm() {
    if (!keep || !foldIn) return;
    startTransition(async () => {
      const result = await mergeUsersAction(keep.id, foldIn.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Merged #${foldIn.id} into #${keep.id}`);
      setOpen(false);
      setTyped("");
      setKeep(null);
      setFoldIn(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Merge two accounts</CardTitle>
        <p className="text-sm text-muted-foreground">
          For one person with two logins. The account folded in hands its groups, roles and records to the account kept,
          then is deactivated (not deleted) and signed out.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <AccountPicker label="Account to keep" id="merge-keep" candidates={candidates} selected={keep} onSelect={setKeep} />
          <AccountPicker label="Account to fold in" id="merge-fold" candidates={candidates} selected={foldIn} onSelect={setFoldIn} />
        </div>

        {preview && keep && foldIn && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2">Group</th>
                    <th className="p-2">#{keep.id} (kept)</th>
                    <th className="p-2">#{foldIn.id} (folded in)</th>
                    <th className="p-2">After the merge</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.length === 0 && (
                    <tr><td className="p-2 text-muted-foreground" colSpan={4}>Neither account belongs to a group.</td></tr>
                  )}
                  {preview.rows.map((r) => (
                    <tr key={r.groupId} className="border-t">
                      <td className="p-2">{r.groupName}</td>
                      <td className="p-2">{roleLabel(r.keep)}{r.keep?.hasMemberRow ? " · savings" : ""}</td>
                      <td className="p-2">{roleLabel(r.foldIn)}{r.foldIn?.hasMemberRow ? " · savings" : ""}</td>
                      <td className="p-2 font-medium">{preview.refusal ? "—" : roleLabel(r.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.warnings.map((w) => <p key={w} className="text-sm text-amber-600">{w}</p>)}
            {preview.refusal ? (
              <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Cannot merge: {preview.refusal}</p>
            ) : (
              <Button onClick={() => setOpen(true)}>Merge #{foldIn.id} into #{keep.id}…</Button>
            )}
          </div>
        )}

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Merge these accounts?</DialogTitle>
            </DialogHeader>
            {keep && foldIn && (
              <div className="space-y-3 text-sm">
                <p>
                  <b>{foldIn.name} #{foldIn.id}</b> will be folded into <b>{keep.name} #{keep.id}</b>. Its groups, roles, savings
                  records and notifications move to #{keep.id}; #{foldIn.id} is deactivated and signed out. The merge is recorded
                  in the platform audit log. It cannot be undone from the app.
                </p>
                <Label htmlFor="merge-confirm">Type {foldIn.id} to confirm</Label>
                <Input id="merge-confirm" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
                  <Button onClick={confirm} disabled={pending || typed.trim() !== String(foldIn.id)}>
                    {pending ? "Merging…" : "Merge"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
