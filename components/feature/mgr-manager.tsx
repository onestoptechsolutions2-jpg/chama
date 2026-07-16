"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import type {
  mgrCycles as mgrCyclesTable,
  mgrSlots as mgrSlotsTable,
  mgrMemberTurns as mgrMemberTurnsTable,
  members as membersTable,
  mgrSlotEvents as mgrSlotEventsTable,
  users as usersTable,
} from "@/lib/db/schema";
import {
  updateMgrConfigAction,
  setTurnsAction,
  generateScheduleAction,
  claimSlotAction,
  adminUpdateSlotAction,
  autoAssignAction,
  createCycleAction,
  closeCycleAction,
  chargeFeeFromWalletAction,
} from "@/app/(dashboard)/mgr/actions";
import { mgrFrequencies } from "@/lib/validation/mgr";
import { calcPlatformFee } from "@/lib/domain/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Cycle = typeof mgrCyclesTable.$inferSelect;
type Slot = typeof mgrSlotsTable.$inferSelect & { member: { name: string } | null };
type CycleWithSlots = Cycle & { slots: Slot[] };
type Turn = typeof mgrMemberTurnsTable.$inferSelect & {
  member: { name: string };
  slotsTaken: number;
};
type Member = typeof membersTable.$inferSelect;
type SlotEvent = typeof mgrSlotEventsTable.$inferSelect & {
  actor: typeof usersTable.$inferSelect | null;
};

function ksh(n: string | number | null) {
  return n === null ? "—" : `Ksh ${Number(n).toLocaleString()}`;
}

const cycleStatusVariant = {
  planned: "secondary",
  active: "default",
  completed: "outline",
  closed: "outline",
} as const;

const slotStatusVariant = {
  open: "secondary",
  claimed: "default",
  auto_assigned: "default",
  paid: "outline",
  skipped: "destructive",
} as const;

function ChargeFeeDialog({
  slot,
  feePct,
  walletBalance,
}: {
  slot: Slot;
  feePct: string;
  walletBalance: string;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletPending, startWalletTransition] = useTransition();

  const fee = calcPlatformFee(Number(slot.payoutAmount), Number(feePct));
  const walletCoversFee = Number(walletBalance) >= fee;

  function chargeFromWallet() {
    setError(null);
    startWalletTransition(async () => {
      const result = await chargeFeeFromWalletAction(slot.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`Deducted Ksh ${result.fee} from the wallet`);
      setOpen(false);
    });
  }

  async function chargeViaStk() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/platform-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mgrSlotId: slot.id, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to trigger payment");
        return;
      }
      toast.success(`STK push sent for Ksh ${data.fee}`);
      setOpen(false);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Charge platform fee
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Charge platform fee — {slot.member?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The platform&apos;s fee on this {ksh(slot.payoutAmount)} payout is {ksh(fee)}.
          </p>
          {walletCoversFee ? (
            <>
              <p className="text-sm text-muted-foreground">
                Covered by this group&apos;s wallet balance ({ksh(walletBalance)}) — deducted
                instantly, no phone prompt.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={chargeFromWallet} disabled={walletPending} className="w-full">
                {walletPending ? "Deducting…" : `Deduct Ksh ${fee} from wallet`}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Wallet balance ({ksh(walletBalance)}) doesn&apos;t cover this fee — top up in{" "}
                <a href="/wallet" className="underline underline-offset-4">Wallet</a>, or send an
                M-Pesa STK push instead.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`fee-phone-${slot.id}`}>Phone number to charge</Label>
                <Input
                  id={`fee-phone-${slot.id}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712345678"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={chargeViaStk} disabled={pending || !phone} className="w-full">
                {pending ? "Sending…" : "Send STK push"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ slot }: { slot: Slot }) {
  const [open, setOpen] = useState(false);
  const [payoutReference, setPayoutReference] = useState("");
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      await adminUpdateSlotAction(slot.id, {
        status: "paid",
        payoutReference: payoutReference || undefined,
      });
      toast.success("Marked paid");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Mark paid</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark paid — {slot.member?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The actual {ksh(slot.payoutAmount)} payout happens outside the app (cash or
            M-Pesa between members) — this just records that it did. Marking it paid is
            logged against your account and can&apos;t be edited or deleted later.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`payout-ref-${slot.id}`}>Payout reference (optional)</Label>
            <Input
              id={`payout-ref-${slot.id}`}
              value={payoutReference}
              onChange={(e) => setPayoutReference(e.target.value)}
              placeholder="M-Pesa confirmation code, or a note"
            />
          </div>
          <Button onClick={confirm} disabled={isPending} className="w-full">
            {isPending ? "Saving…" : "Confirm paid"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule tab ─────────────────────────────────────────────────────────
function SlotRow({
  slot,
  isStaff,
  members,
  canClaim,
  feePct,
  walletBalance,
}: {
  slot: Slot;
  isStaff: boolean;
  members: Member[];
  canClaim: boolean;
  feePct: string;
  walletBalance: string;
}) {
  const [isPending, startTransition] = useTransition();

  function claim() {
    startTransition(async () => {
      const result = await claimSlotAction(slot.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Slot claimed");
    });
  }

  function assign(memberId: string | null) {
    startTransition(() =>
      adminUpdateSlotAction(slot.id, {
        memberId: memberId ? Number(memberId) : null,
        status: memberId ? "auto_assigned" : "open",
      }),
    );
  }

  function skip() {
    startTransition(() => adminUpdateSlotAction(slot.id, { status: "skipped" }));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Slot {slot.slotNumber}</span>
        <span className="font-medium">{slot.member?.name ?? "Open"}</span>
        <Badge variant={slotStatusVariant[slot.status]} className="capitalize">
          {slot.status.replace("_", " ")}
        </Badge>
        <span className="text-muted-foreground">{ksh(slot.payoutAmount)}</span>
      </div>
      <div className="flex items-center gap-2">
        {!isStaff && slot.status === "open" && canClaim && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={claim}>
            Claim
          </Button>
        )}
        {isStaff && (
          <>
            <Select
              value={slot.memberId ? String(slot.memberId) : ""}
              onValueChange={(v) => assign(v || null)}
              items={Object.fromEntries([
                ["", "Unassigned"],
                ...members.map((m) => [String(m.id), m.name]),
              ])}
            >
              <SelectTrigger className="w-40" disabled={isPending}>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {slot.status !== "paid" && slot.member && <MarkPaidDialog slot={slot} />}
            {slot.status === "open" && (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={skip}>
                Skip
              </Button>
            )}
            {slot.status === "paid" && slot.member && (
              <ChargeFeeDialog slot={slot} feePct={feePct} walletBalance={walletBalance} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CycleCard({
  cycle,
  isStaff,
  members,
  canClaim,
  feePct,
  walletBalance,
}: {
  cycle: CycleWithSlots;
  isStaff: boolean;
  members: Member[];
  canClaim: boolean;
  feePct: string;
  walletBalance: string;
}) {
  const [open, setOpen] = useState(cycle.status === "active");
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Cycle {cycle.cycleNumber}
            {cycle.scheduledDate && (
              <span className="ml-2 font-normal text-muted-foreground">{cycle.scheduledDate}</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={cycleStatusVariant[cycle.status]} className="capitalize">
              {cycle.status}
            </Badge>
            {isStaff && cycle.status === "active" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  startTransition(() => closeCycleAction(cycle.id));
                }}
              >
                Close cycle
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          {cycle.slots.length === 0 && (
            <p className="text-sm text-muted-foreground">No slots.</p>
          )}
          {cycle.slots.map((s) => (
            <SlotRow
              key={s.id}
              slot={s}
              isStaff={isStaff}
              members={members}
              canClaim={canClaim}
              feePct={feePct}
              walletBalance={walletBalance}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function ScheduleTab({
  cycles,
  isStaff,
  members,
  canClaim,
  feePct,
  walletBalance,
}: {
  cycles: CycleWithSlots[];
  isStaff: boolean;
  members: Member[];
  canClaim: boolean;
  feePct: string;
  walletBalance: string;
}) {
  if (cycles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No schedule generated yet.{isStaff && " Use the Admin tab to generate one."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {cycles.map((c) => (
        <CycleCard
          key={c.id}
          cycle={c}
          isStaff={isStaff}
          members={members}
          canClaim={canClaim}
          feePct={feePct}
          walletBalance={walletBalance}
        />
      ))}
    </div>
  );
}

// ── Turns tab ────────────────────────────────────────────────────────────
function TurnRow({ turn, editable }: { turn: Turn; editable: boolean }) {
  const [value, setValue] = useState(turn.turnsTotal);
  const [isPending, startTransition] = useTransition();

  function save() {
    const fd = new FormData();
    fd.set("memberId", String(turn.memberId));
    fd.set("turnsTotal", String(value));
    startTransition(async () => {
      const result = await setTurnsAction(null, fd);
      if (result?.error) toast.error(result.error);
      else toast.success("Turns updated");
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="font-medium">{turn.member.name}</span>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">
          {turn.slotsTaken} / {turn.turnsTotal} used
        </span>
        {editable ? (
          <>
            <Input
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-20"
            />
            <Button size="sm" variant="outline" disabled={isPending} onClick={save}>
              Save
            </Button>
          </>
        ) : (
          <span>{turn.turnsTotal} turns</span>
        )}
      </div>
    </div>
  );
}

function TurnsTab({
  turns,
  isStaff,
  myMemberId,
}: {
  turns: Turn[];
  isStaff: boolean;
  myMemberId: number | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-2">
        {turns.length === 0 && <p className="text-sm text-muted-foreground">No turn records yet.</p>}
        {turns.map((t) => (
          <TurnRow key={t.id} turn={t} editable={isStaff || t.memberId === myMemberId} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Admin tab ────────────────────────────────────────────────────────────
function ConfigForm({
  config,
}: {
  config: {
    mgrFrequency: string;
    mgrRecipientsPerCycle: number | null;
    mgrStartDate: string | null;
    mgrContributionAmount: string | null;
    sharePrice: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await updateMgrConfigAction(null, formData);
      if (result?.error) toast.error(result.error);
      else toast.success("Config saved");
      return result;
    },
    null,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cycle configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="mgrFrequency">Frequency</Label>
            <Select
              name="mgrFrequency"
              defaultValue={config.mgrFrequency}
              items={Object.fromEntries(mgrFrequencies.map((f) => [f, f]))}
            >
              <SelectTrigger id="mgrFrequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mgrFrequencies.map((f) => (
                  <SelectItem key={f} value={f} className="capitalize">
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgrRecipientsPerCycle">Recipients per cycle</Label>
            <Input
              id="mgrRecipientsPerCycle"
              name="mgrRecipientsPerCycle"
              type="number"
              min={1}
              defaultValue={config.mgrRecipientsPerCycle ?? 1}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgrStartDate">Start date</Label>
            <Input
              id="mgrStartDate"
              name="mgrStartDate"
              type="date"
              defaultValue={config.mgrStartDate ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgrContributionAmount">Contribution per cycle (Ksh)</Label>
            <Input
              id="mgrContributionAmount"
              name="mgrContributionAmount"
              type="number"
              min={0}
              defaultValue={config.mgrContributionAmount ?? config.sharePrice}
            />
          </div>
          {state?.error && (
            <p className="lg:col-span-4 text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" disabled={pending} className="lg:col-span-4 lg:w-fit">
            {pending ? "Saving…" : "Save configuration"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AdminActions() {
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await generateScheduleAction();
      if (result?.error) toast.error(result.error);
      else toast.success("Schedule generated");
    });
  }

  function autoAssign() {
    startTransition(async () => {
      const result = await autoAssignAction();
      toast.success(`Assigned ${result.assigned} slot(s)`);
    });
  }

  function addCycle() {
    startTransition(() => createCycleAction());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button disabled={isPending} onClick={generate}>
          {isPending ? "Working…" : "Generate / rebuild schedule"}
        </Button>
        <Button variant="outline" disabled={isPending} onClick={autoAssign}>
          Auto-assign open slots
        </Button>
        <Button variant="outline" disabled={isPending} onClick={addCycle}>
          Add cycle manually
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Activity log (immutable — see lib/db/schema.ts's mgrSlotEvents) ────────
function ActivityLog({ events, members }: { events: SlotEvent[]; members: Member[] }) {
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  function memberName(id: number | null) {
    if (id === null) return "—";
    return nameById.get(id) ?? `#${id}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Every claim, reassignment, and paid-marking below is permanent — this table can be
          added to but never edited or erased, including by an admin.
        </p>
        {events.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        )}
        {events.map((e) => (
          <div key={e.id} className="border-b py-2 text-sm last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{e.actor?.name ?? "Unknown user"}</span>
                {e.actorRole && <span className="text-muted-foreground"> ({e.actorRole})</span>}{" "}
                <span className="capitalize text-muted-foreground">
                  {e.action.replace(/_/g, " ")}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {memberName(e.fromMemberId)} → {memberName(e.toMemberId)}
              {e.fromStatus !== e.toStatus && (
                <>
                  {" · "}
                  {e.fromStatus ?? "—"} → {e.toStatus ?? "—"}
                </>
              )}
              {e.note && <> · {e.note}</>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────
export function MgrManager({
  config,
  cycles,
  turns,
  members,
  isStaff,
  myMemberId,
  blockedByAgreement,
  slotEvents,
  walletBalance,
}: {
  config: {
    mgrFrequency: string;
    mgrRecipientsPerCycle: number | null;
    mgrStartDate: string | null;
    mgrContributionAmount: string | null;
    sharePrice: string;
    mgrFeePct: string;
  };
  cycles: CycleWithSlots[];
  turns: Turn[];
  members: Member[];
  isStaff: boolean;
  myMemberId: number | null;
  blockedByAgreement: boolean;
  slotEvents: SlotEvent[];
  walletBalance: string;
}) {
  return (
    <Tabs defaultValue="schedule">
      <TabsList>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="turns">Turns</TabsTrigger>
        {isStaff && <TabsTrigger value="admin">Admin</TabsTrigger>}
      </TabsList>

      <TabsContent value="schedule">
        <ScheduleTab
          cycles={cycles}
          isStaff={isStaff}
          members={members}
          canClaim={!blockedByAgreement}
          feePct={config.mgrFeePct}
          walletBalance={walletBalance}
        />
      </TabsContent>

      <TabsContent value="turns">
        <TurnsTab turns={turns} isStaff={isStaff} myMemberId={myMemberId} />
      </TabsContent>

      {isStaff && (
        <TabsContent value="admin" className="space-y-6">
          <ConfigForm config={config} />
          <AdminActions />
          <ActivityLog events={slotEvents} members={members} />
        </TabsContent>
      )}
    </Tabs>
  );
}
