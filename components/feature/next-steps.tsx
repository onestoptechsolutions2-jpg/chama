import Link from "next/link";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NextStep } from "@/lib/domain/next-steps";

const ICONS = { critical: CircleAlert, warning: AlertTriangle, info: Info } as const;
const TONE = {
  critical: "text-red-600",
  warning: "text-amber-600",
  info: "text-primary",
} as const;

/** The assistant's short list on Home. */
export function NextSteps({ steps, limit = 4 }: { steps: NextStep[]; limit?: number }) {
  if (steps.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next steps</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {steps.slice(0, limit).map((s) => {
          const Icon = ICONS[s.severity];
          return (
            <div key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 gap-3">
                <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[s.severity]}`} />
                <div className="min-w-0">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.detail}</p>
                </div>
              </div>
              <Link href={s.href} className={buttonVariants({ size: "sm", variant: s.severity === "info" ? "outline" : "default" })}>
                {s.action}
              </Link>
            </div>
          );
        })}
        {steps.length > limit && (
          <p className="pt-3 text-sm text-muted-foreground">+ {steps.length - limit} more after these.</p>
        )}
      </CardContent>
    </Card>
  );
}
