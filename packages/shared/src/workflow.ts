/** Workflow status state machine for PostPackage / VisualPackage. */

export const WORKFLOW_STATUSES = [
  'IDEA',
  'DRAFTING',
  'GENERATED',
  'IN_REVIEW',
  'NEEDS_CHANGES',
  'APPROVED',
  'EXPORTED',
  'ARCHIVED',
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const LEGAL_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  IDEA: ['DRAFTING', 'ARCHIVED'],
  DRAFTING: ['GENERATED', 'ARCHIVED'],
  GENERATED: ['IN_REVIEW', 'DRAFTING', 'ARCHIVED'],
  IN_REVIEW: ['NEEDS_CHANGES', 'APPROVED', 'ARCHIVED'],
  NEEDS_CHANGES: ['IN_REVIEW', 'DRAFTING', 'ARCHIVED'],
  APPROVED: ['EXPORTED', 'NEEDS_CHANGES', 'ARCHIVED'],
  EXPORTED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export const VISUAL_FORMATS = [
  'single_image',
  'carousel',
  'quote_card',
  'statistic_card',
  'founder_insight_card',
  'event_promo',
  'case_study_graphic',
  'problem_solution',
  'before_after',
  'mini_framework',
  'checklist_carousel',
  'educational_carousel',
  'announcement_graphic',
] as const;
export type VisualFormat = (typeof VISUAL_FORMATS)[number];

export const CONTENT_OBJECTIVES = [
  'thought_leadership',
  'announcement',
  'event_promotion',
  'case_study',
  'educational',
  'hiring',
  'founder_insight',
  'project_update',
  'industry_commentary',
] as const;
export type ContentObjective = (typeof CONTENT_OBJECTIVES)[number];

/** LinkedIn canvas presets — the only dimensions validation accepts. */
export const LINKEDIN_CANVAS_PRESETS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 627 },
} as const;
export const MAX_CAROUSEL_SLIDES = 20;
