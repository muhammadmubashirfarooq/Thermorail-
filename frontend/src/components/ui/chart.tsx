"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactNode;
};

export function ChartContainer({ className, config, children, ...props }: ChartContainerProps) {
  return (
    <div
      data-chart="analytics"
      className={cn("flex min-h-[180px] w-full justify-center text-xs", className)}
      {...props}
    >
      <style>{Object.entries(config).map(([key, item]) => `[data-chart="analytics"] { --color-${key}: ${item.color ?? "currentColor"}; }`).join("\n")}</style>
      {children}
    </div>
  );
}

type TooltipPayload = { name?: string; value?: string | number; color?: string };

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
};

export function ChartTooltipContent({ active, payload, label }: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700/80 bg-[#0B0D14]/95 px-3 py-2 text-xs shadow-2xl">
      {label !== undefined && <p className="mb-1 text-slate-400">{label}</p>}
      {payload.map((item) => (
        <div className="flex items-center justify-between gap-5" key={`${item.name}-${item.value}`}>
          <span className="flex items-center gap-2 text-slate-300">
            <i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? "#8B5CF6" }} />
            {item.name}
          </span>
          <strong className="font-mono text-slate-100">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
