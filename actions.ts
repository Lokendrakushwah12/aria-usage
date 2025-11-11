'use server';

import type { Browser, Page } from 'playwright';

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

const MAX_TAB_ITERATIONS = 30;

export async function checkAccessibilityAction(
  _prevState: AccessibilityCheckState | undefined,
  formData: FormData
): Promise<AccessibilityCheckState> {
  const rawUrl = (formData.get('url') || '').toString().trim();

  if (!rawUrl) {
    return {
      ok: false,
      summary: 'Please provide a URL to check.',
      errors: ['Missing URL'],
    };
  }

  const normalizedUrl = normalizeUrl(rawUrl);
  let browser: Browser | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });

    const page = await browser.newPage();
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(250);

    const tabOrder = await buildTabOrderReport(page);
    const aria = await getAriaReport(page);

    return {
      ok: true,
      summary: `Accessibility quick-check completed for ${normalizedUrl}`,
      url: normalizedUrl,
      tabOrder,
      aria,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      summary: `Unable to complete accessibility check for ${normalizedUrl}`,
      url: normalizedUrl,
      errors: [message],
    };
  } finally {
    await browser?.close();
  }
}

function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    return input;
  }
  return `https://${input}`;
}

async function buildTabOrderReport(page: Page): Promise<TabOrderReport> {
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === 'function') {
      active.blur();
    }
    window.scrollTo(0, 0);
  });

  const visited: FocusTarget[] = [];
  let cycleDetected = false;
  let limitReached = false;

  for (let i = 0; i < MAX_TAB_ITERATIONS; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(50);

    const target = await getActiveElementMetadata(page);
    if (!target) {
      break;
    }

    if (visited.some((item) => item.selector === target.selector && item.name === target.name)) {
      cycleDetected = true;
      break;
    }

    visited.push(target);
  }

  if (visited.length === MAX_TAB_ITERATIONS) {
    limitReached = true;
  }

  const shiftTabConsistent = await verifyShiftTab(page, visited);

  return { visited, cycleDetected, limitReached, shiftTabConsistent };
}

async function verifyShiftTab(page: Page, visited: FocusTarget[]): Promise<boolean | null> {
  if (visited.length <= 1) {
    return null;
  }

  const lastTarget = visited[visited.length - 1];

  const refocused = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.focus();
      return true;
    }
    return false;
  }, lastTarget.selector);

  if (!refocused) {
    return null;
  }

  for (let i = visited.length - 1; i > 0; i--) {
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(50);
    const target = await getActiveElementMetadata(page);
    if (!target) {
      return false;
    }

    const expected = visited[i - 1];
    if (target.selector !== expected.selector || target.name !== expected.name) {
      return false;
    }
  }

  return true;
}

async function getActiveElementMetadata(page: Page): Promise<FocusTarget | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return null;
    }

    const selector = buildSelector(el);
    const role = el.getAttribute('role') || null;
    const name = deriveAccessibleName(el);
    const htmlSnippet = el.outerHTML.slice(0, 160);

    return {
      selector,
      tag: el.tagName.toLowerCase(),
      role,
      name,
      hasAccessibleName: Boolean(name && name.trim().length > 0),
      htmlSnippet,
    };
  });
}

async function getAriaReport(page: Page): Promise<AriaReport> {
  return page.evaluate(() => {
    const ariaNodes = document.querySelectorAll('[aria-label],[aria-labelledby],[aria-describedby],[role]');
    const images = Array.from(document.querySelectorAll('img'));
    const imagesMissingAlt = images
      .filter((img) => {
        const alt = img.getAttribute('alt');
        if (alt === null) {
          return true;
        }
        const trimmed = alt.trim();
        if (trimmed.length === 0 && !img.getAttribute('role')) {
          return true;
        }
        return false;
      })
      .slice(0, 20)
      .map((img) => ({
        src: img.getAttribute('src'),
        snippet: img.outerHTML.slice(0, 160),
      }));

    return {
      ariaAttributeCount: ariaNodes.length,
      imagesMissingAlt,
    };
  });
}

function buildSelector(el: Element): string {
  if (el.id) {
    return `#${cssEscape(el.id)}`;
  }

  const path: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && depth < 4) {
    let selector = current.tagName.toLowerCase();
    const classes = Array.from(current.classList);
    if (classes.length) {
      selector += `.${classes.map((cls) => cssEscape(cls)).join('.')}`;
    }

    const siblings = Array.from(current.parentElement?.children || []).filter(
      (child) => child.tagName === current?.tagName
    );

    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
    depth += 1;
  }

  return path.join(' > ');
}

function deriveAccessibleName(el: HTMLElement): string | null {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim().length > 0) {
    return ariaLabel.trim();
  }

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const text = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => node?.textContent?.trim() || '')
      .join(' ')
      .trim();
    if (text.length > 0) {
      return text;
    }
  }

  const title = el.getAttribute('title');
  if (title && title.trim().length > 0) {
    return title.trim();
  }

  if (el instanceof HTMLImageElement) {
    const alt = el.getAttribute('alt');
    if (alt && alt.trim().length > 0) {
      return alt.trim();
    }
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim().length > 0) {
      return placeholder.trim();
    }
    const name = el.getAttribute('name');
    if (name && name.trim().length > 0) {
      return name.trim();
    }
  }

  const textContent = el.textContent?.trim();
  if (textContent && textContent.length > 0) {
    return textContent;
  }

  return null;
}

function cssEscape(value: string): string {
  // Basic CSS escape implementation compatible with most selectors
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~ ])/g, '\\$1');
}

