export type FocusTarget = {
  selector: string;
  tag: string;
  role: string | null;
  name: string | null;
  hasAccessibleName: boolean;
  htmlSnippet: string;
};

export type TabOrderReport = {
  visited: FocusTarget[];
  cycleDetected: boolean;
  limitReached: boolean;
  shiftTabConsistent: boolean | null;
};

export type AriaReport = {
  ariaAttributeCount: number;
  imagesMissingAlt: Array<{ src: string | null; snippet: string }>;
};

export type AccessibilityCheckState = {
  ok: boolean;
  summary: string;
  url?: string;
  tabOrder?: TabOrderReport;
  aria?: AriaReport;
  errors?: string[];
};

export const MAX_TAB_ITERATIONS = 100;

export function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    return input;
  }
  return `https://${input}`;
}


