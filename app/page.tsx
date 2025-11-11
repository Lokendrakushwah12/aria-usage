import AccessibilityChecker from "@/components/AccessibilityChecker";
import { Badge } from "@/components/ui/badge";
import { ModeSwitcher } from "@/components/mode-switcher";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen font-sans z-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-16 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-4">
         <div className="flex items-center justify-between">
          <Badge variant="outline" size="default" className="font-mono tracking-tight w-fit py-1 h-fit uppercase text-muted-foreground">
            // Basic Accessibility Checks
          </Badge>
          <ModeSwitcher />
         </div>
          <h1 className="text-3xl font-medium tracking-tighter sm:text-4xl lg:text-5xl">
            Verify keyboard navigation and essential ARIA usage with one click
          </h1>
          <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-300">
            Paste any website URL below to run Playwright-powered smoke tests.
            We will simulate tabbing through the page and highlight missing alt
            text or ARIA attributes so you can fix accessibility issues faster.
          </p>
        </header>

        <AccessibilityChecker />

        <footer className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Tip: Ensure Playwright browsers are installed locally by running{" "}
          <code>npx playwright install</code> before starting the development
          server.
        </footer>
      </div>
    </main>
  );
}
