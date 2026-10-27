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
  startNewRotationAction,
  reshuffleUnpaidAction,
  setTurnPreferencesAction,
  fillByPreferencesAction,
  archiveRotationAction,
  chargeFeeFromWalletAction,
  rescheduleRotationAction,
} from "@/app/(dashboard)/dashboard/mgr/actions";
import { cyclesNeeded, rotationEndDate, summarizeRotation, type MgrFrequency, type MgrStanding } from "@/lib/domain/mgr";
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
export type RotationView = {
  id: number;
  number: number;
  status: string;
  startDate: string;
  endDate: string;
  frequency: MgrFrequency;
  recipientsPerCycle: number;
  contributionAmount: string;
  /** A payout has been made (or a cycle finished): the start date is fixed, later dates can still move. */
  started: boolean;
  finished: boolean;
  paidOut: number;
};

const byNumber = <T extends { cycleNumber: number }>(cycles: T[]) => [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
/** cycleNumber → position within the rotation, for labels. */
const positions = (cycles: { cycleNumber: number }[]) => new Map(byNumber(cycles).map((c, i) => [c.cycleNumber, i + 1]));

const FREQUENCY_LABEL: Record<string, string> = { weekly: "weekly", biweekly: "every 2 weeks", monthly: "monthly" };
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
  closed: "outline", // legacy
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
                <a href="/dashboard/wallet" className="underline underline-offset-4">Wallet</a>, or send an
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
      const result = await adminUpdateSlotAction(slot.id, {
        status: "paid",
        payoutReference: payoutReference || undefined,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
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
    startTransition(async () => {
      const result = await adminUpdateSlotAction(slot.id, {
        memberId: memberId ? Number(memberId) : null,
        status: memberId ? "auto_assigned" : "open",
      });
      if (result?.error) toast.error(result.error);
    });
  }

  function skip() {
    startTransition(async () => {
      const result = await adminUpdateSlotAction(slot.id, { status: "skipped" });
      if (result?.error) toast.error(result.error);
    });
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
            {slot.status !== "paid" && (
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
            )}
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
  position,
}: {
  cycle: CycleWithSlots;
  isStaff: boolean;
  members: Member[];
  canClaim: boolean;
  feePct: string;
  walletBalance: string;
  /** 1-based position within its rotation (cycle numbers run on across rotations). */
  position: number;
}) {
  const [open, setOpen] = useState(cycle.status === "active");
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Cycle {position}
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
                  startTransition(async () => {
                    const result = await closeCycleAction(cycle.id);
                    if (result?.error) toast.error(result.error);
                    else toast.success(`Cycle ${position} closed`);
                  });
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

/** The live rotation's dates. The end date is automatic; officials can move the start (or the remaining dates). */
function RotationHeader({ rotation, isStaff, today }: { rotation: RotationView; isStaff: boolean; today: string }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(rotation.started ? "" : rotation.startDate);
  const [isPending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const result = await rescheduleRotationAction(date);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Dates moved");
        setEditing(false);
      }
    });
  }
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-base font-semibold">Rotation {rotation.number}</p>
      <p className="text-sm text-muted-foreground">
        {rotation.startDate > today ? "Starts" : "Started"} {rotation.startDate} · ends {rotation.endDate} — the end date is set by the
        system from your members, their turns and the {FREQUENCY_LABEL[rotation.frequency] ?? rotation.frequency} schedule. It
        archives itself when the last turn is paid.
      </p>
      {isStaff &&
        (editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="rotation-date">{rotation.started ? "Move the next payout to" : "New start date"}</Label>
              <Input id="rotation-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            <Button size="sm" disabled={isPending || !date} onClick={save}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <p className="basis-full text-xs text-muted-foreground">
              {rotation.started
                ? "Paid cycles keep their dates; the next payout and all after it move. The end date follows."
                : "Every cycle moves with it. The end date follows."}
            </p>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {rotation.started ? "Move remaining dates" : "Change start date"}
          </Button>
        ))}
    </div>
  );
}

function ScheduleTab({
  cycles,
  rotations,
  liveRotationId,
  isStaff,
  members,
  canClaim,
  feePct,
  walletBalance,
  today,
}: {
  cycles: CycleWithSlots[];
  rotations: RotationView[];
  liveRotationId: number | null;
  isStaff: boolean;
  members: Member[];
  canClaim: boolean;
  feePct: string;
  walletBalance: string;
  today: string;
}) {
  const live = rotations.find((r) => r.id === liveRotationId) ?? null;
  const past = rotations.filter((r) => r.status === "archived");
  if (!live && past.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rotation yet.{isStaff && " Use the Admin tab to plan the first one."}
      </p>
    );
  }
  const current = cycles.filter((c) => c.rotationId === liveRotationId);
  const progress = summarizeRotation(current);
  return (
    <div className="space-y-3">
      {live && <RotationHeader rotation={live} isStaff={isStaff} today={today} />}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-base font-semibold">
          {progress.currentCycle
            ? `Cycle ${progress.currentCycle} of ${progress.totalCycles}`
            : "No cycle running"}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {progress.paidSlots} of {progress.totalSlots} turns paid
          </span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      {!live && (
        <p className="text-sm text-muted-foreground">
          The last rotation finished and is archived.{isStaff && " Use the Admin tab to start the next one."}
        </p>
      )}
      {byNumber(current).map((c, i) => (
        <CycleCard
          key={c.id}
          cycle={c}
          position={i + 1}
          isStaff={isStaff}
          members={members}
          canClaim={canClaim}
          feePct={feePct}
          walletBalance={walletBalance}
        />
      ))}
      {past.length > 0 && <p className="pt-2 text-base font-semibold">Past rotations</p>}
      {past.map((r) => {
        const own = cycles.filter((c) => c.rotationId === r.id);
        const slots = own.flatMap((c) => c.slots);
        return (
          <details key={r.id} className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">Rotation {r.number}</span>
              <span className="text-muted-foreground">
                {" "}
                · {r.startDate} → {r.endDate} · {slots.filter((s) => s.status === "paid").length} of {slots.length} turns paid ·{" "}
                {ksh(r.paidOut)} paid out
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {byNumber(own).map((c, i) => (
                <CycleCard
                  key={c.id}
                  cycle={c}
                  position={i + 1}
                  isStaff={false}
                  members={members}
                  canClaim={false}
                  feePct={feePct}
                  walletBalance={walletBalance}
                />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ── Turns tab ────────────────────────────────────────────────────────────
function TurnRow({ turn, editable, standing }: { turn: Turn; editable: boolean; standing?: MgrStanding }) {
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
      <div>
        <span className="font-medium">{turn.member.name}</span>
        {standing && standing.expected > 0 && (
          <p className={standing.owed > 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            Paid in {ksh(standing.paid)} of {ksh(standing.expected)}
            {standing.owed > 0 ? ` · owes ${ksh(Math.ceil(standing.owed))}` : " · up to date"}
          </p>
        )}
      </div>
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

/** A member's wish list for the current rotation: up to 3 cycles, best first. */
function MyPreferences({
  turn,
  cycles,
  closeDate,
  choicesOpen,
  isStaff,
}: {
  turn: Turn;
  cycles: CycleWithSlots[];
  closeDate: string | null;
  choicesOpen: boolean;
  isStaff: boolean;
}) {
  const pos = positions(cycles);
  const upcoming = byNumber(cycles).filter((c) => c.status === "planned" || c.status === "active");
  const [choices, setChoices] = useState<string[]>([
    String(turn.preferredCycles?.[0] ?? ""),
    String(turn.preferredCycles?.[1] ?? ""),
    String(turn.preferredCycles?.[2] ?? ""),
  ]);
  const [isPending, startTransition] = useTransition();
  const labels = ["First choice", "Second choice", "Third choice"];
  const locked = !isStaff && !choicesOpen;

  function save() {
    const picked = choices.filter(Boolean).map(Number);
    startTransition(async () => {
      const result = await setTurnPreferencesAction(turn.memberId, picked);
      if (result?.error) toast.error(result.error);
      else toast.success("Your choices are saved");
    });
  }

  if (upcoming.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Which turn would you like?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pick up to 3. When the turns are given out, choices are honoured fairly and nobody is favoured.
          {closeDate && (locked ? ` Choices closed on ${closeDate}.` : ` You can change them until ${closeDate}.`)}
        </p>
        {labels.map((label, i) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-28 text-sm">{label}</span>
            <select
              value={choices[i]}
              onChange={(e) => setChoices(choices.map((c, j) => (j === i ? e.target.value : c)))}
              disabled={locked}
              className="h-11 flex-1 rounded-md border bg-background px-3 text-base"
            >
              <option value="">No preference</option>
              {upcoming.map((c) => (
                <option key={c.id} value={c.cycleNumber}>
                  Cycle {pos.get(c.cycleNumber)}
                  {c.scheduledDate ? ` · ${c.scheduledDate}` : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button disabled={isPending || locked} onClick={save}>
          {isPending ? "Saving…" : "Save my choices"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TurnsTab({
  turns,
  cycles,
  isStaff,
  myMemberId,
  choicesCloseDate,
  choicesOpen,
  standings,
}: {
  standings: Record<number, MgrStanding>;
  turns: Turn[];
  cycles: CycleWithSlots[];
  isStaff: boolean;
  myMemberId: number | null;
  choicesCloseDate: string | null;
  choicesOpen: boolean;
}) {
  const mine = turns.find((t) => t.memberId === myMemberId);
  return (
    <div className="space-y-4">
      {mine && <MyPreferences
          turn={mine}
          cycles={cycles}
          closeDate={choicesCloseDate}
          choicesOpen={choicesOpen}
          isStaff={isStaff}
        />}
      <Card>
        <CardContent className="space-y-2">
          {turns.length === 0 && <p className="text-sm text-muted-foreground">No turn records yet.</p>}
          {turns.map((t) => (
            <div key={t.id}>
              <TurnRow
                turn={t}
                editable={isStaff || t.memberId === myMemberId}
                standing={isStaff || t.memberId === myMemberId ? standings[t.memberId] : undefined}
              />
              {isStaff && t.preferredCycles && t.preferredCycles.length > 0 && (
                <p className="pb-2 text-xs text-muted-foreground">
                  Would like: {t.preferredCycles.map((n) => `Cycle ${positions(cycles).get(n) ?? n}`).join(", ")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Admin tab ────────────────────────────────────────────────────────────
function ConfigForm({
  config,
  totalTurns,
  hasLiveRotation,
}: {
  totalTurns: number;
  hasLiveRotation: boolean;
  config: {
    mgrFrequency: string;
    mgrRecipientsPerCycle: number | null;
    mgrStartDate: string | null;
    mgrChoicesCloseDate: string | null;
    mgrContributionAmount: string | null;
    mgrRequireUpToDate: boolean;
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
  const [frequency, setFrequency] = useState(config.mgrFrequency);
  const [recipients, setRecipients] = useState(String(config.mgrRecipientsPerCycle ?? 1));
  const [start, setStart] = useState(config.mgrStartDate ?? "");
  const cycles = cyclesNeeded(totalTurns, Number(recipients) || 1);
  const preview = start && cycles > 0 ? rotationEndDate(start, frequency as MgrFrequency, cycles) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rotation settings</CardTitle>
        <p className="text-sm text-muted-foreground">
          Used for the next rotation{hasLiveRotation ? ", and for the current one until its first payout (press Rebuild schedule)" : ""}.
          You choose the start; the end date is worked out for you.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="mgrFrequency">Frequency</Label>
            <Select
              name="mgrFrequency"
              defaultValue={config.mgrFrequency}
              onValueChange={(v) => setFrequency(String(v ?? config.mgrFrequency))}
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
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgrStartDate">First payout of the next rotation</Label>
            <Input
              id="mgrStartDate"
              name="mgrStartDate"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgrChoicesCloseDate">Members can choose turns until</Label>
            <Input
              id="mgrChoicesCloseDate"
              name="mgrChoicesCloseDate"
              type="date"
              defaultValue={config.mgrChoicesCloseDate ?? ""}
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
          <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="mgrRequireUpToDate" defaultChecked={config.mgrRequireUpToDate} className="mt-0.5 size-4" />
            <span>
              Only pay out to members who are up to date — a turn can&apos;t be marked paid while its member owes merry-go-round
              contributions for this cycle or earlier ones. Record contributions as type &quot;Merry-go-round&quot; (or account &quot;12 mgr&quot; on M-Pesa).
            </span>
          </label>
          <p className="rounded-md bg-muted/50 p-3 text-sm sm:col-span-2 lg:col-span-4">
            {totalTurns} turns ÷ {Number(recipients) || 1} per cycle = <strong>{cycles} cycles</strong>, {FREQUENCY_LABEL[frequency] ?? frequency}.
            {preview ? (
              <>
                {" "}
                Starting {start}, it ends on <strong>{preview}</strong>.
              </>
            ) : (
              " Pick a start date to see the end date."
            )}
          </p>
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

function AdminActions({ live, suggestedStart, today }: { live: RotationView | null; suggestedStart: string | null; today: string }) {
  const [isPending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(suggestedStart ?? today);

  function generate() {
    startTransition(async () => {
      const result = await generateScheduleAction(live ? undefined : startDate);
      if (result?.error) toast.error(result.error);
      else toast.success(live ? "Schedule rebuilt" : "Rotation planned");
    });
  }

  function autoAssign(draw: boolean) {
    startTransition(async () => {
      const result = await autoAssignAction(draw);
      toast.success(`Assigned ${result.assigned} slot(s)`);
    });
  }

  function fillByPreferences() {
    startTransition(async () => {
      const result = await fillByPreferencesAction();
      toast.success(
        result.assigned === 0
          ? "No open turns to fill"
          : `${result.assigned} turn(s) filled, ${result.byChoice} by members' choice`,
      );
    });
  }

  function reshuffle() {
    startTransition(async () => {
      const result = await reshuffleUnpaidAction();
      toast.success(
        result.reshuffled === 0
          ? "No handed-out turns to reshuffle"
          : `${result.reshuffled} turn(s) drawn again`,
      );
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveRotationAction();
      if (result?.error) toast.error(result.error);
      else toast.success("Rotation archived");
    });
  }

  function startNew(draw: boolean) {
    startTransition(async () => {
      const result = await startNewRotationAction(draw, startDate);
      if (result?.error) toast.error(result.error);
      else toast.success("New rotation started");
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
        {!live && (
          <div className="basis-full space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Start the next rotation</p>
            <div className="space-y-1">
              <Label htmlFor="next-start">First payout</Label>
              <Input id="next-start" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending || !startDate} onClick={() => startNew(true)}>
                Start (random order)
              </Button>
              <Button variant="outline" disabled={isPending || !startDate} onClick={() => startNew(false)}>
                Start (join order)
              </Button>
              <Button variant="outline" disabled={isPending || !startDate} onClick={generate}>
                Plan only, fill turns later
              </Button>
            </div>
          </div>
        )}
        {live && (
        <>
        <Button disabled={isPending} onClick={generate}>
          {isPending ? "Working…" : "Rebuild schedule"}
        </Button>
        <Button variant="outline" disabled={isPending} onClick={() => autoAssign(false)}>
          Fill open slots in order
        </Button>
        <Button disabled={isPending} onClick={fillByPreferences}>
          Fill open slots by members&apos; choices
        </Button>
        <Button variant="outline" disabled={isPending} onClick={() => autoAssign(true)}>
          Fill open slots by random draw
        </Button>
        <Button variant="outline" disabled={isPending} onClick={reshuffle}>
          Reshuffle turns not yet paid
        </Button>
        <Button variant="outline" disabled={isPending} onClick={addCycle}>
          Add cycle manually
        </Button>
        {live.finished && (
          <Button variant="outline" disabled={isPending} onClick={archive}>
            Archive finished rotation
          </Button>
        )}
        <p className="basis-full text-xs text-muted-foreground">
          The rotation archives itself when its last turn is paid; then you can start the next one here.
        </p>
        </>
        )}
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
  rotations,
  standings,
  liveRotationId,
  suggestedStart,
  totalTurns,
  today,
  turns,
  members,
  isStaff,
  myMemberId,
  blockedByAgreement,
  slotEvents,
  walletBalance,
  choicesOpen,
}: {
  config: {
    mgrFrequency: string;
    mgrRecipientsPerCycle: number | null;
    mgrStartDate: string | null;
    mgrChoicesCloseDate: string | null;
    mgrContributionAmount: string | null;
    mgrRequireUpToDate: boolean;
    sharePrice: string;
    mgrFeePct: string;
  };
  cycles: CycleWithSlots[];
  rotations: RotationView[];
  /** memberId → paid-in standing in the live rotation (cycles so far). */
  standings: Record<number, MgrStanding>;
  liveRotationId: number | null;
  suggestedStart: string | null;
  totalTurns: number;
  today: string;
  turns: Turn[];
  members: Member[];
  isStaff: boolean;
  myMemberId: number | null;
  blockedByAgreement: boolean;
  slotEvents: SlotEvent[];
  walletBalance: string;
  choicesOpen: boolean;
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
          rotations={rotations}
          liveRotationId={liveRotationId}
          today={today}
          isStaff={isStaff}
          members={members}
          canClaim={!blockedByAgreement}
          feePct={config.mgrFeePct}
          walletBalance={walletBalance}
        />
      </TabsContent>

      <TabsContent value="turns">
        <TurnsTab
          turns={turns}
          cycles={cycles.filter((c) => c.rotationId === liveRotationId)}
          isStaff={isStaff}
          myMemberId={myMemberId}
          choicesCloseDate={config.mgrChoicesCloseDate}
          choicesOpen={choicesOpen}
          standings={standings}
        />
      </TabsContent>

      {isStaff && (
        <TabsContent value="admin" className="space-y-6">
          <ConfigForm config={config} totalTurns={totalTurns} hasLiveRotation={liveRotationId !== null} />
          <AdminActions live={rotations.find((r) => r.id === liveRotationId) ?? null} suggestedStart={suggestedStart} today={today} />
          <ActivityLog events={slotEvents} members={members} />
        </TabsContent>
      )}
    </Tabs>
  );
}
