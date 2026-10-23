"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { runAgentAction, startSupportSessionAction } from "@/app/super-admin/support/actions";
import type { AgentReport } from "@/lib/agent/run";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type ConsoleGroup = {
  id: number;
  name: string;
  kind: string;
  active: boolean;
  members: number;
  setupIncomplete: boolean;
  work: {
    unmatchedPayments: number;
    joinRequests: number;
    loanRequests: number;
    overdueLoans: number;
    welfareRequests: number;
    pendingInvites: number;
  };
  workTotal: number;
};

export type ConsoleSession = { id: number; staff: string; group: string; mode: string; reason: string; at: string; live: boolean };

const WORK_LABELS: Record<keyof ConsoleGroup["work"], string> = {
  overdueLoans: "overdue loans",
  unmatchedPayments: "payments to match",
  joinRequests: "join requests",
  loanRequests: "loan requests",
  welfareRequests: "welfare requests",
  pendingInvites: "invites not accepted",
};

/** Every group, its waiting work, and a one-step "Open" into support mode. */
export function SupportConsole({
  groups,
  recent,
  canAct,
  canRunAgent,
}: {
  groups: ConsoleGroup[];
  recent: ConsoleSession[];
  canAct: boolean;
  canRunAgent: boolean;
}) {
  const [query, setQuery] = useState("");
  const [onlyWork, setOnlyWork] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = groups.filter((g) => (!q || g.name.toLowerCase().includes(q)) && (!onlyWork || g.workTotal > 0 || g.setupIncomplete));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a group" className="max-w-xs" aria-label="Find a group" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyWork} onChange={(e) => setOnlyWork(e.target.checked)} />
          Only groups with something waiting
        </label>
        <span className="text-sm text-muted-foreground">{shown.length} of {groups.length} groups</span>
      </div>

      <div className="space-y-3">
        {shown.map((g) => (
          <GroupRow key={g.id} group={g} canAct={canAct} canRunAgent={canRunAgent} />
        ))}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">No groups match.</p>}
      </div>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent support sessions</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {recent.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{r.staff}</strong> in {r.group} · {r.mode === "act" ? "made changes" : "view only"} · “{r.reason}”
                </span>
                <span className="text-muted-foreground">
                  {r.live && <Badge className="mr-2">Live</Badge>}
                  {new Date(r.at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GroupRow({ group: g, canAct, canRunAgent }: { group: ConsoleGroup; canAct: boolean; canRunAgent: boolean }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<AgentReport | { error: string } | null>(null);
  const [agentPending, startAgent] = useTransition();
  const runAgent = (dryRun: boolean) => startAgent(async () => setAgent(await runAgentAction(g.id, dryRun)));
  const [state, formAction, pending] = useActionState(startSupportSessionAction.bind(null, g.id), null);
  const work = (Object.keys(WORK_LABELS) as (keyof ConsoleGroup["work"])[]).filter((k) => g.work[k] > 0);

  return (
    <Card className={g.active ? undefined : "opacity-60"}>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {g.name} {!g.active && <Badge variant="secondary">Inactive</Badge>}
            </p>
            <p className="text-sm text-muted-foreground">
              {g.kind} · {g.members} members
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {g.setupIncomplete && <Badge variant="outline">Setup not finished</Badge>}
              {work.map((k) => (
                <Badge key={k} variant={k === "overdueLoans" ? "destructive" : "secondary"}>
                  {g.work[k]} {WORK_LABELS[k]}
                </Badge>
              ))}
              {work.length === 0 && !g.setupIncomplete && <span className="text-xs text-muted-foreground">Nothing waiting</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/super-admin/groups/${g.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Details
            </Link>
            {canRunAgent && (
              <Button size="sm" variant="outline" disabled={agentPending} onClick={() => runAgent(true)}>
                {agentPending ? "Checking…" : "Run agent"}
              </Button>
            )}
            <Button size="sm" variant={open ? "secondary" : "default"} onClick={() => setOpen((o) => !o)}>
              {open ? "Cancel" : "Open"}
            </Button>
          </div>
        </div>
        {agent && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
            {"error" in agent ? (
              <p className="text-destructive">{agent.error}</p>
            ) : agent.steps.length === 0 ? (
              <p className="text-muted-foreground">The agent&apos;s rules find nothing to do for this group right now.</p>
            ) : (
              <>
                <p className="font-medium">{agent.dryRun ? "The agent would do this (fixed rules, no AI):" : "Done:"}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {agent.steps.map((s, i) => (
                    <li key={i}>
                      {s.summary}
                      {s.ok === false && <span className="text-destructive"> — not done: {s.error}</span>}
                    </li>
                  ))}
                </ul>
                {agent.dryRun && (
                  <Button size="sm" disabled={agentPending} onClick={() => runAgent(false)}>
                    {agentPending ? "Running…" : "Do it"}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        {open && (
          <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/40 p-3">
            <div className="min-w-56 flex-1 space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor={`reason-${g.id}`}>
                Why (the group sees this)
              </label>
              <Input id={`reason-${g.id}`} name="reason" required minLength={5} placeholder="e.g. Treasurer asked for help matching payments" />
            </div>
            <select name="mode" defaultValue={canAct ? "act" : "view"} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="Mode">
              <option value="view">View only</option>
              {canAct && <option value="act">Work on it (make changes)</option>}
            </select>
            <Button type="submit" disabled={pending}>
              {pending ? "Opening…" : "Open as group admin"}
            </Button>
            {state?.error && <p className="basis-full text-sm text-destructive">{state.error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
