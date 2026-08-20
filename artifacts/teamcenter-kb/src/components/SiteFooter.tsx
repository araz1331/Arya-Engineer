export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span>Built by Arya AI</span>
        <span aria-hidden="true">|</span>
        <span>Powered by Anthropic Claude</span>
        <span aria-hidden="true">|</span>
        <a href="/about" className="font-medium text-primary hover:underline">
          About Arya Engineer
        </a>
      </div>
    </footer>
  );
}