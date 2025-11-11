import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import playwrightCore from "playwright-core";
import type {
  Browser,
  BrowserContext,
  LaunchOptions,
  Page,
} from "playwright-core";
import {
  type AccessibilityCheckState,
  type AriaReport,
  type FocusTarget,
  type TabOrderReport,
  MAX_TAB_ITERATIONS,
  normalizeUrl,
} from "@/lib/accessibility-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        summary: "Invalid request payload.",
        errors: ["Expected JSON body with a url field."],
      },
      { status: 400 }
    );
  }

  const rawUrl = (payload as { url?: unknown })?.url?.toString().trim() ?? "";
  if (!rawUrl) {
    return NextResponse.json(
      {
        ok: false,
        summary: "Please provide a URL to check.",
        errors: ["Missing URL"],
      },
      { status: 400 }
    );
  }

  const normalizedUrl = normalizeUrl(rawUrl);

  const isVercel = Boolean(process.env.VERCEL && process.env.VERCEL !== "false");
  const playwright = await resolvePlaywright(isVercel);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const launchOptions = await buildLaunchOptions(isVercel);

    browser = await playwright.chromium.launch(launchOptions);

    context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    page = await context.newPage();
    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.waitForTimeout(250);

    const tabOrder = await buildTabOrderReport(page);
    const aria = await getAriaReport(page);

    const result: AccessibilityCheckState = {
      ok: true,
      summary: `Accessibility quick-check completed for ${normalizedUrl}`,
      url: normalizedUrl,
      tabOrder,
      aria,
    };

    await context.close();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const failure: AccessibilityCheckState = {
      ok: false,
      summary: `Unable to complete accessibility check for ${normalizedUrl}`,
      url: normalizedUrl,
      errors: [message],
    };
    return NextResponse.json(failure, { status: 500 });
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function resolvePlaywright(isVercel: boolean) {
  if (isVercel) {
    return playwrightCore;
  }

  try {
    const localPlaywright = await import("playwright");
    return localPlaywright as typeof playwrightCore;
  } catch (error) {
    console.warn(
      "[api/check] Falling back to playwright-core. Did you run `npx playwright install`?"
    );
    return playwrightCore;
  }
}

async function buildLaunchOptions(isVercel: boolean): Promise<LaunchOptions> {
  if (!isVercel) {
    return {
      headless: true,
    };
  }

  const executablePath = await chromium.executablePath();
  return {
    args: chromium.args,
    executablePath,
    headless: true,
  };
}

async function buildTabOrderReport(page: Page): Promise<TabOrderReport> {
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === "function") {
      active.blur();
    }
    window.scrollTo(0, 0);
  });

  const visited: FocusTarget[] = [];
  let cycleDetected = false;
  let limitReached = false;

  for (let i = 0; i < MAX_TAB_ITERATIONS; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);

    const target = await getActiveElementMetadata(page);
    if (!target) {
      break;
    }

    if (
      visited.some(
        (item) =>
          item.selector === target.selector && item.name === target.name
      )
    ) {
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

async function verifyShiftTab(
  page: Page,
  visited: FocusTarget[]
): Promise<boolean | null> {
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
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(50);
    const target = await getActiveElementMetadata(page);
    if (!target) {
      return false;
    }

    const expected = visited[i - 1];
    if (
      target.selector !== expected.selector ||
      target.name !== expected.name
    ) {
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

    function cssEscape(value: string): string {
      return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~ ])/g, "\\$1");
    }

    function buildSelector(element: Element): string {
      if ((element as HTMLElement).id) {
        return `#${cssEscape((element as HTMLElement).id)}`;
      }

      const path: string[] = [];
      let current: Element | null = element;
      let depth = 0;

      while (current && depth < 4) {
        let selector = current.tagName.toLowerCase();
        const classes = Array.from((current as HTMLElement).classList);
        if (classes.length) {
          selector += `.${classes.map((cls) => cssEscape(cls)).join(".")}`;
        }

        const siblings = Array.from(
          current.parentElement?.children || []
        ).filter((child) => child.tagName === current?.tagName);

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }

        path.unshift(selector);
        current = current.parentElement;
        depth += 1;
      }

      return path.join(" > ");
    }

    function deriveAccessibleName(element: HTMLElement): string | null {
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.trim().length > 0) {
        return ariaLabel.trim();
      }

      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const ids = labelledBy.split(/\s+/);
        const text = ids
          .map((id) => document.getElementById(id))
          .filter((node): node is HTMLElement => Boolean(node))
          .map((node) => node.textContent?.trim() || "")
          .join(" ")
          .trim();
        if (text.length > 0) {
          return text;
        }
      }

      const title = element.getAttribute("title");
      if (title && title.trim().length > 0) {
        return title.trim();
      }

      if (element instanceof HTMLImageElement) {
        const alt = element.getAttribute("alt");
        if (alt && alt.trim().length > 0) {
          return alt.trim();
        }
      }

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const placeholder = element.getAttribute("placeholder");
        if (placeholder && placeholder.trim().length > 0) {
          return placeholder.trim();
        }
        const nameAttr = element.getAttribute("name");
        if (nameAttr && nameAttr.trim().length > 0) {
          return nameAttr.trim();
        }
      }

      const textContent = element.textContent?.trim();
      if (textContent && textContent.length > 0) {
        return textContent;
      }

      return null;
    }

    const selector = buildSelector(el);
    const role = el.getAttribute("role") || null;
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
    const ariaNodes = document.querySelectorAll(
      "[aria-label],[aria-labelledby],[aria-describedby],[role]"
    );
    const images = Array.from(document.querySelectorAll("img"));
    const imagesMissingAlt = images
      .filter((img) => {
        const alt = img.getAttribute("alt");
        if (alt === null) {
          return true;
        }
        const trimmed = alt.trim();
        if (trimmed.length === 0 && !img.getAttribute("role")) {
          return true;
        }
        return false;
      })
      .slice(0, 20)
      .map((img) => ({
        src: img.getAttribute("src"),
        snippet: img.outerHTML.slice(0, 160),
      }));

    return {
      ariaAttributeCount: ariaNodes.length,
      imagesMissingAlt,
    };
  });
}
