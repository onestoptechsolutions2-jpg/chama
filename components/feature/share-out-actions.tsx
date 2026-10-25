"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cancelShareOutAction, confirmShareOutAction, prepareShareOutAction } from "@/app/(dashboard)/dashboard/share-out/actions";
import { Button } from "@/components/ui/button";

type Result = { error: string } | { ok: true; message: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else toast.success(r.message);
    });
  return { pending, run };
}

/** "Prepare share-out" for the period and options shown on the page. */
export function PrepareShareOutButton(props: {
  from: string;
  to: string;
  method: "time" | "savings";
  otherIncome: number;
  expenses: number;
  keepShares: boolean;
}) {
  const { pending, run } = useRun();
  return (
    <Button disabled={pending} onClick={() => run(() => prepareShareOutAction(props))}>
      {pending ? "Preparing…" : "Prepare this share-out"}
    </Button>
  );
}

/** Confirm (a different official) or cancel a prepared share-out. */
export function DraftShareOutButtons({ shareOutId, canConfirm }: { shareOutId: number; canConfirm: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      {canConfirm && (
        <Button
          disabled={pending}
          onClick={() => {
            if (window.confirm("Confirm the share-out? Loans and fines are settled from each share and savings are paid out. This can't be undone."))
              run(() => confirmShareOutAction(shareOutId));
          }}
        >
          {pending ? "Working…" : "Confirm share-out"}
        </Button>
      )}
      <Button variant="outline" disabled={pending} onClick={() => run(() => cancelShareOutAction(shareOutId))}>
        Cancel
      </Button>
    </div>
  );
}
