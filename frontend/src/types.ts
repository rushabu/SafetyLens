export type Assessment = "SIF_POTENTIAL" | "NON_SIF_POTENTIAL" | "INSUFFICIENT_INFORMATION";
export type ModelStatus = Assessment | "PROCESSING_ERROR" | "PENDING";
export type RuleStatus = "breach" | "control" | "unclear";

export interface EngineDesc {
  id: "baseline" | "llm";
  label: string;
  description: string;
  available: boolean;
  external: boolean;
  version?: string;
  data_policy?: string;
  provider?: string | null;
  model?: string | null;
}

export interface Meta {
  app: string;
  app_version: string;
  default_engine: "baseline" | "llm";
  engines: EngineDesc[];
  taxonomy: {
    version: string;
    source_urls: string[];
    source_note: string;
    rules: { id: string; label: string; scope_note: string }[];
    other_hazards: { id: string; label: string }[];
    activity_categories: Record<string, string>;
    hazard_categories: Record<string, { label: string; severity: string }>;
    barrier_categories: Record<string, { label: string; rules: string[] }>;
  };
  rubric: {
    version: string;
    status: string;
    owner_note: string;
    classes: Record<Assessment, string>;
    principles: string[];
    small_sample_n: number;
  };
  lexicon_version: string;
}

export interface Quote {
  quote: string;
  start: number | null;
  end: number | null;
}

export interface AnalysisOutput {
  assessment: Assessment;
  rationale: string;
  event_modality: string;
  activity: { category: string; description: string | null; evidence: Quote[] } | null;
  hazards: { category: string; description: string | null; evidence: Quote[] }[];
  exposure: { status: string; description: string | null; evidence: Quote[] };
  barriers: { category: string; description: string | null; status: "failed" | "effective" | "unknown"; critical: boolean; evidence: Quote[] }[];
  potential_consequence: { description: string | null; evidence: Quote[] } | null;
  rule_tags: { rule_id: string; relevance: string; status: RuleStatus; explanation: string; evidence: Quote[] }[];
  other_hazards: { id: string; explanation: string; evidence: Quote[] }[];
  missing_information: string[];
  evidence_sufficiency: string;
  flags: string[];
}

export interface Span {
  id: number;
  owner_type: string;
  owner_key: string;
  start: number;
  end: number;
  quote: string;
}

export interface AnalysisFull {
  id: number;
  is_current: boolean;
  status: "COMPLETED" | "PROCESSING_ERROR";
  assessment: Assessment | null;
  rationale: string | null;
  event_modality: string | null;
  evidence_sufficiency: string | null;
  engine_type: "baseline" | "llm";
  engine_version: string;
  model: string | null;
  prompt_version: string | null;
  rubric_version: string;
  taxonomy_version: string;
  error: string | null;
  attempts: number;
  latency_ms: number | null;
  validation: Record<string, unknown> | null;
  flags: string[];
  output: AnalysisOutput | null;
  spans: Span[];
  created_at: string;
}

export interface ReviewRec {
  id: number;
  analysis_id: number | null;
  reviewer: string;
  action: "confirm" | "correct";
  assessment: Assessment;
  model_assessment: Assessment | null;
  rule_tags: { rule_id: string; status: RuleStatus }[];
  notes: string | null;
  created_at: string;
}

export interface ReportDetail {
  report: {
    id: number;
    uid: string;
    external_id: string | null;
    text: string;
    site: string | null;
    report_date: string | null;
    report_date_raw: string | null;
    report_type: string | null;
    source_type: string;
    provenance: string | null;
    extra_fields: Record<string, string> | null;
    batch: { id: number; name: string } | null;
    created_at: string;
    near_duplicate_of: { id: number; uid: string } | null;
    near_duplicate_score: number | null;
    near_duplicates: { id: number; uid: string }[];
  };
  analysis: AnalysisFull | null;
  analyses: { id: number; is_current: boolean; status: string; assessment: Assessment | null; engine_type: string; model: string | null; created_at: string }[];
  reviews: ReviewRec[];
  pending_job: { id: number; status: string; engine: string } | null;
}

export interface ReportListItem {
  id: number;
  uid: string;
  external_id: string | null;
  site: string | null;
  report_date: string | null;
  report_type: string | null;
  source_type: string;
  near_duplicate: boolean;
  excerpt: string;
  status: ModelStatus;
  model_assessment: Assessment | null;
  activity: string | null;
  sufficiency: string | null;
  engine_type: string | null;
  rule_tags: { rule_id: string; status: RuleStatus; relevance: string }[];
  reviewed: boolean;
  review_assessment: Assessment | null;
  review_rule_tags: { rule_id: string; status: RuleStatus }[];
  reviewer: string | null;
  reviewed_at: string | null;
}

export interface Counts {
  total: number;
  sif: number;
  non_sif: number;
  insufficient: number;
  determinate: number;
  density: number | null;
  density_low?: number | null;
  density_high?: number | null;
  density_rank?: number | null;
  small_sample: boolean;
  processing_errors?: number;
  pending?: number;
  unreviewed?: number;
}

export interface Overview {
  meta: {
    filters: FiltersEcho;
    small_sample_threshold: number;
    density_definition: string;
    view_label: string;
    excluded_by_filters: number;
    synthetic_in_db: number;
  };
  summary: Counts & {
    reporting_volume: number;
    near_duplicates_in_scope: number;
    undated: number;
    reviewed?: number;
    reviewer_agreement?: { agree: number; of: number };
  };
  by_site: (Counts & { key: string })[];
  by_activity: (Counts & { key: string; label: string })[];
  trend: (Counts & { month: string })[];
  rules: {
    rows: { rule_id: string; label: string; reports: number; breach: number; control: number; unclear: number; sif_reports: number }[];
    reports_with_any_tag: number;
    total_tags: number;
    reports_in_scope: number;
    note: string;
  };
  barriers: { category: string; label: string; failed: number; effective: number; unknown: number; failed_in_sif: number }[];
  focus_areas: (Counts & {
    site: string;
    activity: string;
    activity_label: string;
    top_failed_barriers: { category: string; label: string; reports: number }[];
    top_rules: { rule_id: string; label: string; reports: number }[];
  })[];
  backlog: {
    unreviewed_completed: number;
    by_assessment: Record<Assessment, number>;
    processing_errors: number;
    pending: number;
    oldest_unreviewed: string | null;
  };
}

export interface FiltersEcho {
  date_from: string | null;
  date_to: string | null;
  sites: string[];
  activities: string[];
  source_types: string[];
  include_near_duplicates: boolean;
  view: "model" | "reviewed";
  notes: string[];
}

export interface FilterOptions {
  sites: string[];
  activities: { id: string; label: string }[];
  source_types: string[];
  date_min: string | null;
  date_max: string | null;
  rules: { id: string; label: string }[];
}

export interface Batch {
  id: number;
  name: string;
  kind: string;
  filename: string | null;
  source_type: string;
  provenance: string | null;
  engine: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  skipped_duplicates: number;
  rejected_rows: number;
  near_duplicates: number;
  jobs: { total: number; queued: number; running: number; done: number; failed: number; interrupted: number; finished: number };
  created_at: string;
  updated_at: string;
}

export interface BatchDetail extends Batch {
  row_issues: { row_number: number; severity: string; code: string; message: string }[];
  failed_jobs: { job_id: number; report_id: number; report_uid: string; external_report_id: string | null; status: string; attempts: number; error: string | null }[];
}

export interface Preview {
  filename: string;
  file_sha256: string;
  columns: string[];
  mapping: Record<string, string>;
  ignored_columns: string[];
  missing_optional_columns: string[];
  total_rows: number;
  valid_rows: number;
  importable_rows: number;
  error_rows: number;
  duplicate_rows: number;
  near_duplicate_rows: number;
  row_source_types: string[];
  suggested_source_type: "operational" | "synthetic";
  issues: { row_number: number; severity: string; code: string; message: string }[];
  sample_rows: {
    row_number: number;
    report_id: string | null;
    report_text: string;
    site: string | null;
    report_date: string | null;
    report_type: string | null;
    source_type: string | null;
    near_duplicate: boolean;
  }[];
  already_imported_batch: { id: number; name: string; created_at: string } | null;
}

export interface Pattern {
  id: string;
  site: string | null;
  activity: string | null;
  activity_label: string | null;
  hazard: string | null;
  hazard_label: string | null;
  hazard_serious: boolean;
  barrier: string;
  barrier_label: string;
  report_count: number;
  sif_count: number;
  insufficient_count: number;
  sites: string[];
  first_date: string | null;
  last_date: string | null;
  small_sample: boolean;
  reports: { id: number; uid: string; external_id: string | null; site: string | null; report_date: string | null; assessment: Assessment | null; source_type: string }[];
  reports_truncated: boolean;
}

export interface EvalRunSummary {
  id: number;
  dataset: string;
  split: string;
  engine: string;
  engine_version: string;
  model: string | null;
  label_provenance: string;
  n_cases: number;
  headline: { precision: number | null; recall: number | null; f1: number | null; coverage: number | null };
  created_at: string;
}

export interface EvalMetrics {
  n: number;
  confusion_matrix: Record<string, Record<string, number>>;
  sif: { precision: number | null; recall: number | null; recall_on_answered: number | null; f1: number | null; tp: number; predicted_sif: number; reference_sif: number; note: string };
  sif_capture: { reference_sif: number; captured: number; abstained: number; missed_as_non_sif: number; errored: number };
  abstention: { abstention_rate: number | null; coverage: number | null; determinate: number; insufficient: number };
  three_class_accuracy: number | null;
  rules: {
    micro: { precision: number | null; recall: number | null; f1: number | null };
    macro_f1: number | null;
    exact_set_match_rate: number | null;
    per_rule: Record<string, { precision: number | null; recall: number | null; f1: number | null; support: number; tp: number; fp: number; fn: number }>;
    note: string;
  };
  evidence: { quotes_checked: number; quotes_valid: number; validity_rate: number | null; invalid_quotes_removed_by_validator: number; note: string };
  latency_ms: { mean: number | null; p50: number | null; p95: number | null };
  processing_failures: number;
  disagreements?: { report_id: string; scenario_group: string; ref: string; pred: string; ref_rules: string[]; pred_rules: string[] }[];
}

export interface EvalRun extends Omit<EvalRunSummary, "headline"> {
  metrics: EvalMetrics;
}
