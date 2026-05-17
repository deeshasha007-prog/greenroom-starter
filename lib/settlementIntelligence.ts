/** Shared types for Settlement Intelligence API + UI */

export type Confidence = "high" | "medium" | "low";

export type ParsedField<T> = {
  value: T | null;
  confidence: Confidence;
  reason: string;
};

export type ParsedDealFields = {
  deal_type: ParsedField<"vs_net" | "vs_gross">;
  guarantee: ParsedField<number>;
  base_percentage: ParsedField<number>;
  ratchet_threshold: ParsedField<number>;
  ratchet_percentage: ParsedField<number>;
  expense_cap: ParsedField<number>;
  walkout_point: ParsedField<number>;
  recoup_rules: ParsedField<string>;
};

export type SignoffSentiment = {
  sentiment: "approved" | "disputed" | "neutral" | "unknown";
  confidence: Confidence;
  reason: string;
};

export type SettlementIntelligenceRequest = {
  deal_notes_freetext: string | null;
  guarantee_amount: number | null;
  percentage: number | null;
  deal_type: string;
  signoff_text: string | null;
  status: string | null;
};

export type SettlementIntelligenceResponse = {
  parsed: ParsedDealFields;
  signoff: SignoffSentiment;
  plain_language_summary: string;
};
