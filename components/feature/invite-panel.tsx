"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import {
  cancelInviteAction,
  createInviteAction,
  type InviteActionState,
} from "@/app/(dashboard)/dashboard/members/invite-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { displayPhone } from "@/lib/domain/identity";
import { ROLE_LABELS } from "@/lib/domain/invites";

/** What to do with a fresh invite link: it went by SMS, or share it yourself. */
export function InviteResult({ state }: { state: Extract<InviteActionState, { ok: true }> }) {
  const message = `You're invited to join our group on Chama. Open this link to join: ${state.link}`;
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <p>
        {state.smsSent
          ? `Invite sent by SMS to ${displayPhone(state.phone)}.`
          : `Invite ready for ${state.name}. Send them this link:`}
      </p>
      <p className="break-all font-mono text-xs">{state.link}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigator.clipboard.writeText(state.link).then(() => toast.success("Link copied"))}
        >
          <Copy className="size-4" /> Copy link
        </Button>
        {state.phone && (
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`https://wa.me/${state.phone}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

/** "Send invite" for a roster row that has no login yet. */
export function InviteRowButton({ member }: { member: { id: number; name: string; phone: string | null } }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<InviteActionState, FormData>(createInviteAction, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Send className="size-4" /> Send invite
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {member.name} to log in</DialogTitle>
        </DialogHeader>
        {state && "ok" in state ? (
          <InviteResult state={state} />
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="memberId" value={member.id} />
            <input type="hidden" name="name" value={member.name} />
            <input type="hidden" name="role" value="member" />
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`invite-phone-${member.id}`}>Phone number</label>
              <input
                id={`invite-phone-${member.id}`}
                name="phone"
                type="tel"
                defaultValue={displayPhone(member.phone)}
                placeholder="0712 345 678"
                className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              They open the link and join with their own account — you never set their password.
            </p>
            {state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type PendingInvite = { id: number; name: string; phone: string | null; email: string | null; role: keyof typeof ROLE_LABELS };

export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const [pending, startTransition] = useTransition();
  if (invites.length === 0) return null;
  return (
    <details className="rounded-xl border p-4" open>
      <summary className="cursor-pointer text-base font-medium">Waiting to join ({invites.length})</summary>
      <div className="mt-3 space-y-2">
        {invites.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {i.name} · {ROLE_LABELS[i.role]} ·{" "}
              <span className="text-muted-foreground">{i.phone ? displayPhone(i.phone) : i.email}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => startTransition(async () => void (await cancelInviteAction(i.id)))}
            >
              Cancel
            </Button>
          </div>
        ))}
      </div>
    </details>
  );
}
