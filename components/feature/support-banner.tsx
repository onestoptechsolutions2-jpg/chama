import { endSupportSessionAction, extendSupportSessionAction } from "@/app/super-admin/support/actions";
import type { SupportContext } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

/** Always visible in support mode, so nobody forgets whose group they're in. */
export function SupportBanner({ support, groupName }: { support: SupportContext; groupName: string }) {
  const ends = support.expiresAt.toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm text-white print:hidden">
      <p>
        <strong>Support mode</strong> · {groupName} · as {support.asUserName ?? "group admin"} ·{" "}
        {support.mode === "act" ? "can make changes" : "view only"} · “{support.reason}” · ends {ends}
      </p>
      <div className="flex gap-2">
        <form action={extendSupportSessionAction}>
          <Button type="submit" size="sm" variant="ghost" className="text-white hover:bg-red-700 hover:text-white">
            Add 30 min
          </Button>
        </form>
        <form action={endSupportSessionAction}>
          <Button type="submit" size="sm" variant="secondary">
            Exit support mode
          </Button>
        </form>
      </div>
    </div>
  );
}
