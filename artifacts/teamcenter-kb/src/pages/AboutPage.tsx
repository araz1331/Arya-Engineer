import { useEffect } from 'react';
import { ArrowRight, Camera, Database, Globe2, ListChecks, Smartphone, Users, Wrench } from 'lucide-react';

const pageTitle = 'Arya Engineer — AI Assistant for Teamcenter';
const pageDescription = 'Instant answers to any Teamcenter question, in any language, from your phone or desktop.';

export function AboutPage() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const previousDescription = description?.getAttribute('content');
    const previousCanonical = canonical?.getAttribute('href');

    document.title = pageTitle;
    description?.setAttribute('content', pageDescription);
    canonical?.setAttribute('href', 'https://tc.arya.az/about');

    return () => {
      document.title = previousTitle;
      if (previousDescription) description?.setAttribute('content', previousDescription);
      if (previousCanonical) canonical?.setAttribute('href', previousCanonical);
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="/about" className="flex items-center gap-2 text-primary">
            <Wrench className="h-5 w-5" />
            <span className="font-semibold tracking-wide text-foreground">Arya Engineer</span>
          </a>
          <a href="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Open assistant
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pb-20 pt-20 sm:px-8 sm:pt-28">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Wrench className="h-3.5 w-3.5" />
              Teamcenter support, reimagined
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Arya Engineer — AI Assistant for Teamcenter
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Instant answers to any Teamcenter question, in any language, from your phone or desktop.
            </p>
            <a
              href="/"
              className="mt-9 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Try it now
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/30">
          <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">A faster way to solve problems</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">What it does</h2>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2">
              {[
                [Camera, 'Upload a screenshot of any Teamcenter error'],
                [Globe2, 'Ask in any language — get an answer in seconds'],
                [Database, 'Based on 1500+ official Siemens GTAC articles'],
                [Smartphone, 'Works on mobile as a native app (PWA)'],
              ].map(([Icon, text]) => (
                <li key={text as string} className="flex gap-3 rounded-2xl border border-border bg-background p-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm leading-6">{text as string}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Made for the people who keep PLM moving</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Who it&apos;s for</h2>
          </div>
          <ul className="space-y-3">
            {[
              'Teamcenter administrators',
              'Engineers working with Teamcenter daily',
              'Implementation partners and consultants',
            ].map((text) => (
              <li key={text} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-sm">
                <Users className="h-5 w-5 text-primary" />
                {text}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-border/60 bg-card/30">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">From question to solution</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                'Open tc.arya.az on any device',
                'Take a photo of the error or type your question',
                'Get an answer with source references',
              ].map((text, index) => (
                <li key={text} className="relative rounded-2xl border border-border bg-background p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{index + 1}</span>
                  <div className="mt-5 flex items-start gap-2 text-sm leading-6">
                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {text}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>Built by Arya AI | Powered by Anthropic Claude</span>
        <a href="/" className="font-medium text-primary hover:underline">Try it now</a>
      </footer>
    </div>
  );
}