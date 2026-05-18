import { NextResponse } from "next/server";
import type {
  SettlementIntelligenceRequest,
  SettlementIntelligenceResponse,
  ParsedDealFields,
  SignoffSentiment,
} from "@/lib/settlementIntelligence";

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1000;

function buildPrompt(body: SettlementIntelligenceRequest): string {
  return `You are a music-venue settlement analyst. Extract deal terms from the inputs below and assess sign-off sentiment.

## Inputs
- deal_type (structured): ${body.deal_type ?? "unknown"}
- guarantee_amount (structured): ${body.guarantee_amount ?? "not provided"}
- percentage (structured): ${body.percentage ?? "not provided"}
- deal_notes_freetext (primary source of truth):
"""
${body.deal_notes_freetext?.trim() || "(empty)"}
"""
- settlement status: ${body.status ?? "none"}
- signoff_text from artist team:
"""
${body.signoff_text?.trim() || "(empty)"}
"""

## Task
Return ONLY valid JSON (no markdown fences) matching this exact shape:

{
  "parsed": {
    "deal_type": { "value": "vs_net" | "vs_gross" | null, "confidence": "high"|"medium"|"low", "reason": "..." },
    "guarantee": { "value": number | null, "confidence": "...", "reason": "..." },
    "base_percentage": { "value": number | null, "confidence": "...", "reason": "..." },
    "ratchet_threshold": { "value": number | null, "confidence": "...", "reason": "..." },
    "ratchet_percentage": { "value": number | null, "confidence": "...", "reason": "..." },
    "expense_cap": { "value": number | null, "confidence": "...", "reason": "..." },
    "walkout_point": { "value": number | null, "confidence": "...", "reason": "..." },
    "recoup_rules": { "value": string | null, "confidence": "...", "reason": "..." }
  },
  "signoff": {
    "sentiment": "approved" | "disputed" | "neutral" | "unknown",
    "confidence": "high"|"medium"|"low",
    "reason": "..."
  },
  "plain_language_summary": "2-3 sentences explaining what this deal likely pays the artist, written for a tour manager on a phone call. Use plain English, no jargon."
}

Rules:
- Prefer deal_notes_freetext over structured fields when they conflict; note conflicts in reason.
- Percentages as decimals (0.85 = 85%).
- ratchet_threshold as fraction of capacity (0.9 = 90% sell-through).. If the deal has a dollar-based walkout pot instead of a 
capacity ratchet, put that dollar amount in walkout_point 
and return null for ratchet_threshold.
- signoff sentiment "approved" if text is clearly positive/agreeing even when status is disputed.
- If terms are missing, use null value and explain in reason.`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function isParsedDealFields(v: unknown): v is ParsedDealFields {
  if (!v || typeof v !== "object") return false;
  const keys = [
    "deal_type",
    "guarantee",
    "base_percentage",
    "ratchet_threshold",
    "ratchet_percentage",
    "expense_cap",
    "walkout_point",
    "recoup_rules",
  ] as const;
  const obj = v as Record<string, unknown>;
  return keys.every((k) => k in obj);
}

function isSignoffSentiment(v: unknown): v is SignoffSentiment {
  if (!v || typeof v !== "object") return false;
  const s = v as SignoffSentiment;
  return (
    typeof s.reason === "string" &&
    ["approved", "disputed", "neutral", "unknown"].includes(s.sentiment) &&
    ["high", "medium", "low"].includes(s.confidence)
  );
}

export async function POST(request: Request) {
  let body: SettlementIntelligenceRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: buildPrompt(body) }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      return NextResponse.json(
        { error: "AI service unavailable. Try again in a moment." },
        { status: 502 },
      );
    }

    const data = await res.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text",
    );
    const rawText = textBlock?.text;
    if (!rawText || typeof rawText !== "string") {
      return NextResponse.json(
        { error: "AI returned an empty response." },
        { status: 502 },
      );
    }

    const parsed = extractJson(rawText) as Partial<SettlementIntelligenceResponse>;
    if (
      !parsed.parsed ||
      !isParsedDealFields(parsed.parsed) ||
      !parsed.signoff ||
      !isSignoffSentiment(parsed.signoff) ||
      typeof parsed.plain_language_summary !== "string"
    ) {
      console.error("Malformed AI JSON:", rawText.slice(0, 500));
      return NextResponse.json(
        { error: "Could not parse AI response. Try again." },
        { status: 502 },
      );
    }

    const response: SettlementIntelligenceResponse = {
      parsed: parsed.parsed,
      signoff: parsed.signoff,
      plain_language_summary: parsed.plain_language_summary,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Settlement intelligence error:", err);
    return NextResponse.json(
      { error: "Something went wrong running settlement intelligence." },
      { status: 500 },
    );
  }
}
