'use client';

import { useActionState, useMemo } from 'react';
import { useFormStatus } from 'react-dom';

import {
  type AccessibilityCheckState,
  type FocusTarget,
  checkAccessibilityAction,
} from '@/lib/actions';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card';

const initialState: AccessibilityCheckState = {
  ok: false,
  summary: 'Paste a URL and run the accessibility checks.',
};

export default function AccessibilityChecker() {
  const [state, formAction] = useActionState(checkAccessibilityAction, initialState);

  const hasResults = useMemo(
    () => Boolean(state.tabOrder || state.aria || state.errors?.length),
    [state.tabOrder, state.aria, state.errors]
  );

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>Accessibility quick-check</CardTitle>
        <CardDescription>
          Paste any public URL to launch Playwright, walk the focus order with Tab / Shift+Tab, and highlight
          common ARIA oversights.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="text-sm font-medium text-foreground">
              Website URL
            </label>
            <UrlInput />
            <p className="text-sm text-muted-foreground">
              Example: <code className="font-mono">https://example.com</code>. The checker runs locally using
              your installed Playwright browsers.
            </p>
          </div>
          <SubmitButton />
        </form>

        <div className="flex flex-col gap-4">
          <StatusBanner state={state} />
          {hasResults && (
            <div className="flex flex-col gap-6">
              {state.tabOrder && <TabOrderResults report={state.tabOrder} />}
              {state.aria && <AriaResults report={state.aria} />}
              {state.errors && state.errors.length > 0 && <ErrorList errors={state.errors} />}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="text-xs leading-relaxed text-muted-foreground">
        Tip: run <code className="font-mono">&nbsp;npx playwright install&nbsp;</code> once to download the required browsers.
      </CardFooter>
    </Card>
  );
}

function UrlInput() {
  const { pending } = useFormStatus();

  return (
    <Input
      id="url"
      name="url"
      type="url"
      size="lg"
      placeholder="https://your-website.com"
      required
      disabled={pending}
      autoComplete="off"
    />
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      variant="default"
      size="lg"
      disabled={pending}
    >
      {pending ? 'Running checks…' : 'Run accessibility checks'}
    </Button>
  );
}

function StatusBanner({ state }: { state: AccessibilityCheckState }) {
  const tone = state.ok
    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-100'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100';

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${tone}`}>
      {state.summary}
    </div>
  );
}

function TabOrderResults({ report }: { report: AccessibilityCheckState['tabOrder'] }) {
  if (!report) {
    return null;
  }

  const issues: string[] = [];
  if (report.cycleDetected) {
    issues.push('Focus cycle detected before exhausting elements — review tabindex values and hidden focus states.');
  }
  if (report.limitReached) {
    issues.push('Tab traversal hit the iteration limit (30). There may be many focusable elements or a loop.');
  }
  if (report.shiftTabConsistent === false) {
    issues.push('Shift+Tab did not walk focus in reverse order — check custom key handlers or tabindex.');
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Keyboard navigation</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Reached {report.visited.length} focusable element{report.visited.length === 1 ? '' : 's'} via sequential tabbing.
      </p>

      {issues.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-200">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-green-700 dark:text-green-300">
          No obvious keyboard navigation issues were detected.
        </p>
      )}

      {report.visited.length > 0 && (
        <FocusTable visited={report.visited} />
      )}
    </section>
  );
}

function FocusTable({ visited }: { visited: FocusTarget[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 text-sm dark:border-zinc-800">
      <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Summary</th>
            <th className="px-4 py-2">Selector</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Accessible name</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {visited.map((item, index) => (
            <tr key={`${item.selector}-${index}`} className="bg-white odd:bg-zinc-50 dark:bg-zinc-950 odd:dark:bg-zinc-900/40">
              <td className="px-4 py-2 font-mono text-xs text-zinc-500">{index + 1}</td>
              <td className="px-4 py-2">
                <div className="flex flex-col">
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">{item.tag}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {item.htmlSnippet}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-300">{item.selector}</td>
              <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-300">{item.role ?? '—'}</td>
              <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                {item.hasAccessibleName ? item.name : <span className="text-amber-600 dark:text-amber-300">Missing</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AriaResults({ report }: { report: AccessibilityCheckState['aria'] }) {
  if (!report) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">ARIA &amp; alt text</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Found {report.ariaAttributeCount} element{report.ariaAttributeCount === 1 ? '' : 's'} using ARIA-related attributes.
      </p>

      {report.imagesMissingAlt.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
          <p className="font-medium">Images missing descriptive <code>alt</code> text:</p>
          <ul className="space-y-1">
            {report.imagesMissingAlt.map((image, index) => (
              <li key={`${image.src ?? 'unknown'}-${index}`}>
                <span className="font-semibold">src:</span> {image.src ?? 'N/A'}{' '}
                <span className="font-semibold">snippet:</span> {image.snippet}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-green-700 dark:text-green-300">All inspected images include alt text.</p>
      )}
    </section>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-100">
      <h2 className="text-sm font-semibold uppercase tracking-wide">Issues encountered</h2>
      <ul className="list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
      <p className="text-xs opacity-80">
        Make sure Playwright browsers are installed locally by running <code className='font-mono'>npx playwright install</code> if you have
        not already.
      </p>
    </section>
  );
}

