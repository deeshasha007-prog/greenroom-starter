"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlainBadge } from "@/components/ui/badge";
import type {
  SettlementIntelligenceResponse,
  ParsedField,
  Confidence,
  ParsedDealFields,
} from "@/lib/settlementIntelligence";
import {
  calculateVsDeal,
  type VsDealFinancials,
  type VsDealTerms,
} from "@/lib/vsDealMath";

export type SettlementIntelligenceProps = {
  dealNotesFreetext: string | null;
  guaranteeAmount: number | null;
  percentage: number | null;
  dealType: string;
  signoffText: string | null;
  status: string | null;
  grossBoxOffice: number;
  platformFees: number;
  totalExpenses: number;
  ticketsSold: number;
  capacity: number;
};

const FIELD_LABELS: Record<string, string> = {
  deal_type: "Deal type",
  guarantee: "Guarantee",
  base_percentage: "Base %",
  ratchet_threshold: "Ratchet threshold",
  ratchet_percentage: "Ratchet %",
  expense_cap: "Expense cap",
  walkout_point: "Walkout point",
  recoup_rules: "Recoup rules",
};

function formatFieldValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (key === "deal_type") return String(value).replace("_", " ");
  if (key === "base_percentage" || key === "ratchet_percentage") {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : String(value);
  }
  if (key === "ratchet_threshold") {
    const n = Number(value);
    return Number.isFinite(n)
      ? `${(n * 100).toFixed(0)}% capacity`
      : String(value);
  }
  if (key === "recoup_rules") return String(value);
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return String(value);
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const variant =
    level === "high" ? "brand" : level === "medium" ? "amber" : "default";
  return <PlainBadge variant={variant}>{level}</PlainBadge>;
}

function ParsedFieldRow({
  label,
  field,
  fieldKey,
}: {
  label: string;
  field: ParsedField<unknown>;
  fieldKey: string;
}) {
  return (
    <div className="py-3 border-b border-ink-100/80 last:border-0 grid grid-cols-[1fr_auto] gap-3 items-start">
      <div>
        <div className="text-[13px] font-medium text-ink-900">
          {label}
        </div>
        <div className="text-[12px] font-mono tabular text-ink-700 mt-0.5">
          {formatFieldValue(fieldKey, field.value)}
        </div>
        <div className="text-[11.5px] text-ink-400 mt-1 leading-snug">
          {field.reason}
        </div>
      </div>
      <ConfidenceBadge level={field.confidence} />
    </div>
  );
}


function resolveVsDealTerms(
  parsed: ParsedDealFields,
  fallbacks: Pick<
    SettlementIntelligenceProps,
    "guaranteeAmount" | "percentage" | "dealType"
  >,
): VsDealTerms | null {
  const guarantee =
    parsed.guarantee.value ?? fallbacks.guaranteeAmount ?? null;
  const base_pct =
    parsed.base_percentage.value ?? fallbacks.percentage ?? null;

  if (guarantee == null || base_pct == null) return null;

  const is_vs_gross = parsed.deal_type.value === "vs_gross";

  return {
    guarantee,
    base_pct,
    ratchet_threshold: parsed.ratchet_threshold.value,
    ratchet_pct: parsed.ratchet_percentage.value,
    expense_cap: parsed.expense_cap.value,
    is_vs_gross,
  };
}

function VsDealCalculator({
  financials,
  terms,
}: {
  financials: VsDealFinancials;
  terms: VsDealTerms;
}) {
  const result = calculateVsDeal(financials, terms);

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200/80 bg-canvas-soft/50 px-4 py-3 text-[12px] text-ink-400">
        Vs deal calculator needs a guarantee and base percentage from the parser
        or structured deal fields.
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow text-[10px] text-ink-500 mb-1">Vs deal calculator</div>
      <div className="text-[12px] text-ink-400 mb-4">
        Step-by-step math using parsed deal terms and show financials
      </div>
      <div className="space-y-4">
        {result.steps.map((step) => (
          <div
            key={step.step}
            className="rounded-lg border border-ink-200/60 bg-white px-4 py-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Step {step.step} · {step.label}
            </div>
            <div className="text-[12.5px] text-ink-600 mt-1.5 leading-relaxed font-mono tabular">
              {step.calculation}
            </div>
            <div className="text-[14px] font-semibold font-mono tabular text-brand-700 mt-2">
              {step.result}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettlementIntelligence(props: SettlementIntelligenceProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "success"; data: SettlementIntelligenceResponse }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/settlement-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deal_notes_freetext: props.dealNotesFreetext,
            guarantee_amount: props.guaranteeAmount,
            percentage: props.percentage,
            deal_type: props.dealType,
            signoff_text: props.signoffText,
            status: props.status,
          }),
        });

        const json = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setState({
            kind: "error",
            message:
              json.error ??
              "Settlement intelligence is unavailable right now.",
          });
          return;
        }

        setState({ kind: "success", data: json as SettlementIntelligenceResponse });
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              "Could not reach settlement intelligence. Check your connection and API key.",
          });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    props.dealNotesFreetext,
    props.guaranteeAmount,
    props.percentage,
    props.dealType,
    props.signoffText,
    props.status,
  ]);

  const financials: VsDealFinancials = {
    gross_box_office: props.grossBoxOffice,
    platform_fees: props.platformFees,
    total_expenses: props.totalExpenses,
    tickets_sold: props.ticketsSold,
    capacity: props.capacity,
  };

  const showStatusFlag =
    state.kind === "success" &&
    props.status === "disputed" &&
    state.data.signoff.sentiment === "approved";

  const vsTerms =
    state.kind === "success"
      ? resolveVsDealTerms(state.data.parsed, props)
      : null;

  return (
    <Card accent="brand" className="mt-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-700" />
          <div>
            <CardTitle>Settlement Intelligence</CardTitle>
            <CardDescription>
              AI-assisted deal parsing and settlement insights
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {state.kind === "loading" && (
          <div className="flex items-center gap-3 py-8 justify-center text-ink-500">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            <span className="text-[13px]">
              Reading deal terms and sign-off…
            </span>
          </div>
        )}

        {state.kind === "error" && (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-4 py-4 text-[13px] text-ink-700 leading-relaxed">
            {state.message}
          </div>
        )}

        {state.kind === "success" && (
          <div className="space-y-6">
            {showStatusFlag && (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-4 py-4 flex gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13px] font-semibold text-amber-900">
                    Agent has approved this — status still shows Disputed
                  </div>
                  <div className="text-[12.5px] text-ink-600 mt-1 leading-relaxed">
                    Sign-off reads positive but the settlement is marked
                    disputed. Mark as Finalized?
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      className="text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
                      disabled
                      title="Demo only — no database write"
                    >
                      Mark as Finalized (demo)
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="eyebrow text-[10px] text-ink-500 mb-3">
                Plain language summary
              </div>
              <div className="text-[13.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
                {state.data.plain_language_summary}
              </div>
            </div>

            <div>
              <div className="eyebrow text-[10px] text-ink-500 mb-1">
                AI deal parser
              </div>
              <div className="text-[12px] text-ink-400 mb-3">
                Extracted from deal notes with confidence scores
              </div>
              <div className="divide-y divide-ink-100/80">
                {Object.entries(state.data.parsed).map(([key, field]) => (
                  <ParsedFieldRow
                    key={key}
                    fieldKey={key}
                    label={FIELD_LABELS[key] ?? key}
                    field={field as ParsedField<unknown>}
                  />
                ))}
              </div>
            </div>

            {vsTerms && (
              <VsDealCalculator financials={financials} terms={vsTerms} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
