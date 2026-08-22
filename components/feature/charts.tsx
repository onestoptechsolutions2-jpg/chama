"use client";

import { useId, useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, OctagonAlert, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared chart primitives, built in plain HTML/CSS rather than a charting
 * library — consistent with the rest of this app's hand-rolled component
 * style. Color roles (--viz-cat-*, --viz-seq-*, --viz-status-*) are defined
 * in app/globals.css and were run through the dataviz skill's six-check
 * validator against this app's actual light/dark surfaces — don't hand-pick
 * a new hex here; add a new validated slot in globals.css instead.
 */

type StatusRole = "good" | "warning" | "serious" | "critical" | "neutral";

const STATUS_VAR: Record<StatusRole, string> = {
  good: "var(--viz-status-good)",
  warning: "var(--viz-status-warning)",
  serious: "var(--viz-status-serious)",
  critical: "var(--viz-status-critical)",
  neutral: "var(--viz-axis)",
};

const STATUS_ICON: Record<StatusRole, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: Clock,
  serious: AlertTriangle,
  critical: OctagonAlert,
  neutral: Circle,
};

const CAT_VAR = (i: number) => `var(--viz-cat-${(i % 8) + 1})`;
const SEQ_VAR = (step: number) => `var(--viz-seq-${Math.min(Math.max(step, 1), 6)})`;

function Tooltip({ label, value, visible }: { label: string; value: string; visible: boolean }) {
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md transition-opacity ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span className="font-semibold text-popover-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

/** Trend over time / ranked magnitude — one series, sequential hue, no legend needed. */
export function SequentialColumnChart({
  title,
  data,
  formatValue,
  emptyLabel = "No data yet.",
}: {
  title: string;
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const plotHeight = 140;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-end gap-3 border-b" style={{ height: plotHeight + 8, borderColor: "var(--viz-grid)" }}>
              {data.map((d, i) => {
                const h = Math.max((d.value / max) * plotHeight, 3);
                return (
                  <div
                    key={i}
                    className="relative flex w-10 flex-col items-center justify-end focus:outline-none"
                    style={{ height: plotHeight }}
                    tabIndex={0}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover((v) => (v === i ? null : v))}
                  >
                    <Tooltip label={d.label} value={formatValue(d.value)} visible={hover === i} />
                    <span className="mb-1 text-[10px] font-medium text-foreground">
                      {formatValue(d.value).replace("Ksh ", "")}
                    </span>
                    <div
                      className="w-full rounded-t-[4px] transition-[filter]"
                      style={{
                        height: h,
                        background: SEQ_VAR(4),
                        filter: hover === i ? "brightness(1.12)" : undefined,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex min-w-max gap-3">
              {data.map((d, i) => (
                <span key={i} className="w-10 truncate text-center text-[10px] text-muted-foreground" title={d.label}>
                  {d.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Ranked magnitude comparison (e.g. top members) — horizontal bars, one hue, value at tip. */
export function RankedBarList({
  title,
  data,
  formatValue,
  emptyLabel = "No data yet.",
}: {
  title: string;
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          data.map((d, i) => (
            <div
              key={i}
              className="space-y-1 focus:outline-none"
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((v) => (v === i ? null : v))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((v) => (v === i ? null : v))}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="truncate pr-2">{d.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{formatValue(d.value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--viz-grid)" }}>
                <div
                  className="h-full rounded-full transition-[filter]"
                  style={{
                    width: `${Math.max((d.value / max) * 100, 2)}%`,
                    background: SEQ_VAR(4),
                    filter: hover === i ? "brightness(1.12)" : undefined,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Breakdown by lifecycle/severity state — status palette, always icon + label, never color alone. */
export function StatusBarList({
  title,
  rows,
  formatValue,
  emptyLabel = "No data yet.",
}: {
  title: string;
  rows: { label: string; value: number; secondary?: string; status: StatusRole }[];
  formatValue: (n: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          rows.map((r, i) => {
            const Icon = STATUS_ICON[r.status];
            return (
              <div
                key={i}
                className="space-y-1 focus:outline-none"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((v) => (v === i ? null : v))}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 capitalize">
                    <Icon className="size-3.5" style={{ color: STATUS_VAR[r.status] }} />
                    {r.label}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {r.secondary ? `${r.secondary} · ` : ""}
                    {formatValue(r.value)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--viz-grid)" }}>
                  <div
                    className="h-full rounded-full transition-[filter]"
                    style={{
                      width: `${Math.max((r.value / max) * 100, 2)}%`,
                      background: STATUS_VAR[r.status],
                      filter: hover === i ? "brightness(1.1)" : undefined,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/** Part-to-whole composition — one stacked bar, categorical hues, legend with direct values. */
export function CompositionBar({
  title,
  data,
  formatValue,
}: {
  title: string;
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
}) {
  const id = useId();
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {total <= 0 ? (
          <EmptyState label="No balances recorded yet." />
        ) : (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-grid)" }}>
              {data.map((d, i) => {
                const pct = (Math.max(d.value, 0) / total) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={`${id}-${i}`}
                    className="h-full transition-[filter]"
                    style={{
                      width: `${pct}%`,
                      background: CAT_VAR(i),
                      marginLeft: i === 0 ? 0 : 2,
                      filter: hover === i ? "brightness(1.1)" : undefined,
                    }}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {data.map((d, i) => (
                <div
                  key={`${id}-legend-${i}`}
                  className="flex items-center gap-1.5 text-xs"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((v) => (v === i ? null : v))}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: CAT_VAR(i) }} />
                  <span className="truncate text-muted-foreground">{d.label}</span>
                  <span className="ml-auto shrink-0 font-medium tabular-nums">{formatValue(d.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A single ratio against a target/limit — fill severity-colored, track a dim step of the same ramp. */
export function Meter({
  label,
  value,
  max,
  target,
  formatValue,
  severity = "good",
}: {
  label: string;
  value: number;
  max: number;
  target?: number;
  formatValue: (n: number) => string;
  severity?: StatusRole;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const targetPct = target !== undefined && max > 0 ? Math.min(100, Math.max(0, (target / max) * 100)) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatValue(value)}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, var(--viz-axis) 22%, transparent)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: STATUS_VAR[severity] }}
        />
        {targetPct !== null && (
          <div
            className="absolute top-0 h-full w-[2px]"
            style={{ left: `${targetPct}%`, background: "var(--foreground)" }}
            title={`Target: ${formatValue(target ?? 0)}`}
          />
        )}
      </div>
    </div>
  );
}
