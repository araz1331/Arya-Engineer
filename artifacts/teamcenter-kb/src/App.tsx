import { type ChangeEvent, type FormEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  LoaderCircle,
  Menu,
  MessageSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Play,
  Save,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  getGetScrapeStatusQueryKey,
  getGetStatsQueryKey,
  getHealthCheckQueryKey,
  getListArticlesQueryKey,
  useChat,
  useCreateArticle,
  useBulkImportArticles,
  useDebugScrape,
  useGetScrapeStatus,
  useGetStats,
  useHealthCheck,
  useImportPdfArticle,
  useListArticles,
  useStartScrape,
  useSeedScrapeUrls,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not yet recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function IconMark({ small = false }: { small?: boolean }) {
  return (
    <div className={cn('relative grid place-items-center rounded-xl bg-cyan-400 text-slate-950 shadow-[0_0_0_1px_rgba(109,225,237,.45)]', small ? 'h-8 w-8 rounded-lg' : 'h-10 w-10')}>
      <Network className={small ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.5} />
      <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-lime-300" />
    </div>
  );
}

function StatusDot({ status, label }: { status: 'healthy' | 'warning' | 'error'; label: string }) {
  const styles = {
    healthy: 'bg-lime-300 text-lime-950',
    warning: 'bg-amber-200 text-amber-950',
    error: 'bg-red-200 text-red-900',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold', styles[status])} data-testid={`status-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', status === 'healthy' ? 'bg-lime-700' : status === 'warning' ? 'bg-amber-700' : 'bg-red-700')} />
      {label}
    </span>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const isHealthy = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const nav = [
    { href: '/', label: 'Ask the corpus', sub: 'Grounded assistant', icon: MessageSquare },
    { href: '/admin', label: 'Corpus control', sub: 'Index & scraper health', icon: Gauge },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-slate-950 px-4 text-slate-100 md:hidden">
        <div className="flex items-center gap-3">
          <IconMark small />
          <span className="font-display text-sm font-bold tracking-tight">NEXUS / TC</span>
        </div>
        <button type="button" onClick={() => setMobileOpen((value) => !value)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" data-testid="button-toggle-mobile-nav" aria-label="Toggle navigation">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-700/70 bg-slate-950 text-slate-100 transition-transform duration-300 md:translate-x-0',
        collapsed ? 'w-[76px]' : 'w-[252px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        <div className={cn('flex h-20 items-center border-b border-white/10 px-5', collapsed ? 'justify-center px-0' : 'gap-3')}>
          <IconMark />
          {!collapsed && <div><div className="font-display text-[15px] font-bold tracking-tight">NEXUS / TC</div><div className="font-mono-ui mt-0.5 text-[9px] uppercase tracking-[.18em] text-cyan-300/65">SAMT knowledge ops</div></div>}
        </div>
        <div className={cn('px-3 pt-7', collapsed && 'px-2')}>
          {!collapsed && <div className="eyebrow mb-3 px-3 text-slate-500">Workspace</div>}
          <nav className="space-y-1.5" aria-label="Main navigation">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-colors', active ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:bg-white/[.07] hover:text-slate-100', collapsed && 'justify-center px-2')}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  title={collapsed ? item.label : undefined}
                >
                  {active && <span className="absolute -left-3 top-2.5 h-7 w-0.5 rounded-r bg-lime-300" />}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-slate-950' : 'text-cyan-300')} />
                  {!collapsed && <span className="min-w-0"><span className="block text-[13px] font-bold">{item.label}</span><span className={cn('mt-0.5 block text-[10px]', active ? 'text-slate-700' : 'text-slate-500')}>{item.sub}</span></span>}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto px-4 pb-5">
          {!collapsed && <div className="mb-4 rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="flex items-center gap-2 text-[11px] font-bold text-slate-300"><ShieldCheck className="h-3.5 w-3.5 text-lime-300" /> Grounded mode</div><p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">Answers cite indexed GTAC material only.</p></div>}
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="hidden w-full items-center justify-center rounded-lg border border-white/10 p-2 text-slate-500 transition-colors hover:bg-white/[.07] hover:text-slate-200 md:flex" data-testid="button-collapse-sidebar" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </aside>
      {mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 md:hidden" aria-label="Close navigation" data-testid="button-close-mobile-nav" />}
      <main className={cn('min-h-[100dvh] pt-16 transition-[margin] duration-300 md:pt-0', collapsed ? 'md:ml-[76px]' : 'md:ml-[252px]')}>
        <header className="hidden h-16 items-center justify-between border-b border-border/70 bg-background/85 px-8 backdrop-blur md:flex">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><span className="font-mono-ui uppercase tracking-widest text-primary">SAMT / ENGINEERING</span><ChevronRight className="h-3.5 w-3.5" /><span>{location === '/admin' ? 'Corpus control' : 'Ask the corpus'}</span></div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground"><span className={cn('h-1.5 w-1.5 rounded-full', health.isLoading ? 'animate-pulse-soft bg-amber-400' : health.isError ? 'bg-red-500' : 'bg-lime-500')} /> API {health.isLoading ? 'checking' : health.isError ? 'offline' : isHealthy ? 'operational' : 'connected'}</div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2 text-xs font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-[10px] text-slate-700">SK</span> Support engineering</div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoadingLines({ count = 3 }: { count?: number }) {
  return <div className="space-y-3" aria-label="Loading"><div className="h-3 w-28 animate-pulse rounded bg-muted" />{Array.from({ length: count }).map((_, index) => <div key={index} className={cn('h-3 animate-pulse rounded bg-muted', index % 2 ? 'w-[78%]' : 'w-full')} />)}</div>;
}

function QueryError({ message = 'Could not reach the knowledge service.', retry }: { message?: string; retry?: () => void }) {
  return <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900" data-testid="state-error"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1"><p className="text-sm font-bold">Service unavailable</p><p className="mt-1 text-xs text-red-800/80">{message}</p></div>{retry && <button type="button" onClick={retry} className="rounded-lg border border-red-200 bg-red-100 px-3 py-1.5 text-xs font-bold hover:bg-red-200" data-testid="button-retry-query">Retry</button>}</div>;
}

function HomePage() {
  const [question, setQuestion] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reply, setReply] = useState<{ answer: string; sources: Array<{ id: number; title: string; url: string | null; category: string | null; score: number }>; sessionId: string } | null>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ name: string; data: string; mimeType: 'image/png' | 'image/jpeg'; preview: string } | null>(null);
  const [submittedImage, setSubmittedImage] = useState<{ name: string; preview: string } | null>(null);
  const [imageError, setImageError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chat = useChat();
  const stats = useGetStats({ query: { queryKey: getGetStatsQueryKey(), staleTime: 30000 } });
  const suggestions = ['Teamcenter-i necə quraşdırmaq olar?', 'Как установить Teamcenter?', 'How do I install Teamcenter?'];

  const submitQuestion = (event?: FormEvent) => {
    event?.preventDefault();
    const message = question.trim() || (attachedImage ? 'Analyze this screenshot.' : '');
    if (!message || chat.isPending) return;
    setSubmittedQuestion(message);
    setSubmittedImage(attachedImage ? { name: attachedImage.name, preview: attachedImage.preview } : null);
    setReply(null);
    chat.mutate({ data: { message, sessionId, imageData: attachedImage?.data ?? null, imageMimeType: attachedImage?.mimeType ?? null } }, {
      onSuccess: (data) => {
        setReply(data);
        setSessionId(data.sessionId);
      },
    });
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setImageError('Please choose a PNG or JPG screenshot.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError('Screenshots must be smaller than 8 MB.');
      return;
    }
    setImageError('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const [prefix, data] = result.split(',');
      if (!data) {
        setImageError('That image could not be read.');
        return;
      }
      setAttachedImage({
        name: file.name,
        data,
        mimeType: file.type as 'image/png' | 'image/jpeg',
        preview: prefix.startsWith('data:') ? result : `data:${file.type};base64,${data}`,
      });
    };
    reader.onerror = () => setImageError('That image could not be read.');
    reader.readAsDataURL(file);
  };

  return (
    <div className="technical-grid min-h-[calc(100dvh-4rem)] px-4 pb-12 md:px-8 md:pb-16">
      <div className="mx-auto max-w-[1280px]">
        <section className="animate-rise flex flex-col justify-between gap-7 pb-8 pt-9 md:flex-row md:items-end md:pt-12">
          <div><div className="eyebrow mb-4 flex items-center gap-2 text-primary"><span className="h-1.5 w-1.5 rounded-full bg-lime-500" /> Knowledge workspace / 01</div><h1 className="font-display max-w-3xl text-4xl font-bold leading-[1.04] tracking-[-.045em] text-slate-950 md:text-6xl">Ask the corpus.<br /><span className="text-primary">See the evidence.</span></h1><p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground md:text-[15px]">A grounded assistant for the Teamcenter questions that slow projects down. Every answer is anchored to indexed GTAC material.</p></div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border/80 bg-card/80 px-3.5 py-3 shadow-sm"><div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-primary"><Database className="h-4 w-4" /></div><div><div className="font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground">Indexed knowledge</div><div className="font-display text-lg font-bold">{stats.isLoading ? '—' : stats.data ? stats.data.indexedArticles.toLocaleString() : '—'} <span className="font-sans text-[11px] font-semibold text-muted-foreground">articles</span></div></div></div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
          <section className="animate-rise animate-rise-delay-1 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_14px_40px_-24px_rgba(15,35,60,.35)]">
             <div className="flex items-center justify-between border-b border-border/80 px-5 py-4 md:px-7"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-950 text-cyan-300"><Bot className="h-4 w-4" /></div><div><h2 className="text-sm font-extrabold">Teamcenter assistant</h2><p className="text-[11px] text-muted-foreground">Answers stay within the indexed corpus</p><p className="mt-1 font-mono-ui text-[9px] uppercase tracking-wider text-primary">Supports: AZ | RU | EN</p></div></div><span className="font-mono-ui rounded-md bg-lime-100 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-lime-800">RAG / ON</span></div>
            <div className="min-h-[340px] px-5 py-7 md:px-12 md:py-10">
              {!submittedQuestion && !chat.isError && <div className="flex h-full min-h-[250px] flex-col items-center justify-center text-center"><div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-cyan-50 text-primary"><Sparkles className="h-7 w-7" /><span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-lime-500" /></div><h3 className="font-display text-xl font-bold tracking-tight">What are you working through?</h3><p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">Ask about configuration, deployment, integrations, troubleshooting, or Teamcenter architecture.</p><div className="mt-7 flex flex-wrap justify-center gap-2">{suggestions.map((item, index) => <button type="button" key={item} onClick={() => { setQuestion(item); }} className="rounded-full border border-border bg-background px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-cyan-50 hover:text-primary" data-testid={`button-suggestion-${index}`}>{item}</button>)}</div></div>}
              {chat.isError && <QueryError message="The assistant could not complete that request. Your question is still in the composer." retry={() => submitQuestion()} />}
               {submittedQuestion && !chat.isError && <div className="space-y-7"><div className="flex justify-end"><div className="flex max-w-[88%] flex-col items-end gap-2"><div className="rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100 shadow-sm">{submittedQuestion}</div>{submittedImage && <img src={submittedImage.preview} alt={`Uploaded screenshot: ${submittedImage.name}`} className="max-h-52 max-w-[280px] rounded-xl border border-slate-300 object-contain shadow-sm" />}</div></div>{chat.isPending && <div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-50 text-primary"><Bot className="h-4 w-4" /></div><div className="w-full max-w-xl rounded-2xl rounded-tl-md border border-border bg-background px-4 py-4"><LoadingLines count={4} /><div className="mt-4 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-wider text-primary"><LoaderCircle className="h-3 w-3 animate-spin" /> Analyzing screenshot and searching sources</div></div></div>}{reply && <div className="flex items-start gap-3 animate-rise"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-50 text-primary"><Bot className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="rounded-2xl rounded-tl-md border border-border bg-background px-5 py-4 text-sm leading-7 text-slate-700"><div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] font-bold uppercase tracking-widest text-primary"><CheckCircle2 className="h-3.5 w-3.5 text-lime-600" /> Grounded response</div><div className="whitespace-pre-wrap">{reply.answer}</div></div><div className="mt-5"><div className="mb-2 flex items-center justify-between"><div className="eyebrow text-muted-foreground">Retrieved evidence · {reply.sources.length} sources</div><span className="font-mono-ui text-[10px] text-muted-foreground">SESSION {reply.sessionId.slice(0, 8).toUpperCase()}</span></div><div className="grid gap-2">{reply.sources.map((source, index) => <a key={source.id} href={source.url || '#'} target={source.url ? '_blank' : undefined} rel="noreferrer" onClick={(event) => { if (!source.url) event.preventDefault(); }} className="group flex items-start gap-3 rounded-xl border border-border/80 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-cyan-50/50" data-testid={`link-source-${source.id}`}><span className="font-mono-ui pt-0.5 text-[10px] text-primary">0{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-xs font-bold leading-5 text-slate-800 group-hover:text-primary">{source.title}</p>{source.url && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}</div><div className="mt-1 flex items-center gap-2 font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground"><span>{source.category || 'General'}</span><span className="text-border">/</span><span>match {(source.score * 100).toFixed(1)}%</span></div></div></a>)}</div></div></div></div>}</div>}
             </div>
             <form onSubmit={submitQuestion} className="border-t border-border/80 bg-slate-50/70 p-4 md:p-5"><div className="flex items-end gap-3 rounded-xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">{attachedImage && <div className="relative shrink-0"><img src={attachedImage.preview} alt={`Selected screenshot: ${attachedImage.name}`} className="h-12 w-12 rounded-lg border border-border object-cover" /><button type="button" onClick={() => { setAttachedImage(null); setImageError(''); }} className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-slate-950 text-white shadow-sm hover:bg-primary" aria-label="Remove screenshot" data-testid="button-remove-image"><X className="h-3 w-3" /></button></div>}<textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitQuestion(); } }} placeholder={attachedImage ? 'Add a question about this screenshot…' : 'Ask a question... / Sual verin... / Задайте вопрос...'} rows={2} className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70" data-testid="input-chat-question" /><input ref={imageInputRef} type="file" accept="image/png,image/jpeg" onChange={handleImageChange} className="hidden" data-testid="input-chat-image" /><button type="button" onClick={() => imageInputRef.current?.click()} disabled={chat.isPending} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-cyan-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Attach screenshot" title="Attach PNG or JPG screenshot" data-testid="button-attach-image"><Paperclip className="h-4 w-4" /></button><button type="submit" disabled={(!question.trim() && !attachedImage) || chat.isPending} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-submit-chat" aria-label="Submit question"><Send className="h-4 w-4" /></button></div>{imageError && <p className="mt-2 px-1 text-[10px] font-semibold text-red-600">{imageError}</p>}<div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground"><span>Enter to send · Shift + Enter for a new line · PNG/JPG up to 8 MB</span><span className="font-mono-ui">GTAC / PRIVATE</span></div></form>
          </section>

          <aside className="space-y-5">
            <div className="animate-rise animate-rise-delay-2 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-[0_16px_35px_-20px_rgba(15,35,60,.6)]"><div className="flex items-center justify-between"><span className="eyebrow text-cyan-300/70">Signal check</span><Activity className="h-4 w-4 text-cyan-300" /></div><div className="mt-5 flex items-end justify-between"><div><div className="font-display text-3xl font-bold tracking-tight">{stats.isLoading ? '—' : stats.data ? `${Math.round((stats.data.indexedArticles / Math.max(stats.data.totalArticles, 1)) * 100)}%` : '—'}</div><div className="mt-1 text-[11px] text-slate-400">corpus indexed</div></div><StatusDot status={stats.isError ? 'error' : 'healthy'} label={stats.isError ? 'Degraded' : 'Healthy'} /></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all duration-700" style={{ width: `${stats.data ? Math.min(100, (stats.data.indexedArticles / Math.max(stats.data.totalArticles, 1)) * 100) : 0}%` }} /></div><div className="mt-3 flex justify-between font-mono-ui text-[9px] uppercase tracking-wider text-slate-500"><span>{stats.data?.indexedArticles ?? 0} indexed</span><span>{stats.data?.totalArticles ?? 0} discovered</span></div></div>
            <div className="animate-rise animate-rise-delay-3 rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h2 className="text-sm font-extrabold">How to use this cockpit</h2></div><div className="mt-5 space-y-4">{[['01', 'Ask precisely', 'Include the module, version, and observed behavior.'], ['02', 'Inspect the trail', 'Open each GTAC source to validate the recommendation.'], ['03', 'Keep moving', 'Use the corpus controls when the indexed signal goes stale.']].map(([number, title, copy]) => <div key={number} className="flex gap-3"><span className="font-mono-ui pt-0.5 text-[10px] text-primary">{number}</span><div><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy}</p></div></div>)}</div><Link href="/admin" className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[11px] font-bold text-primary hover:text-slate-950" data-testid="link-open-corpus-control">Open corpus control <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
          </aside>
        </div>
      </div>
    </div>
  );
}

const articleCategories = ['Administration', 'Configuration', 'Troubleshooting', 'Installation', 'Integration', 'Development', 'Other'];

function CorpusIngestion({ onRefresh }: { onRefresh: () => void }) {
  const [form, setForm] = useState({ title: '', content: '', category: 'Troubleshooting', tags: '', url: '' });
  const [seedText, setSeedText] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const createArticle = useCreateArticle();
  const importPdf = useImportPdfArticle();
  const bulkImport = useBulkImportArticles();
  const seedUrls = useSeedScrapeUrls();

  const showError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'The import could not be completed.';
    setNotice({ type: 'error', text: message });
  };
  const saveArticle = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    createArticle.mutate({ data: {
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category || null,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      url: form.url.trim() || null,
    } }, {
      onSuccess: () => {
        setForm({ title: '', content: '', category: 'Troubleshooting', tags: '', url: '' });
        setNotice({ type: 'success', text: 'Article added to the corpus.' });
        onRefresh();
      },
      onError: showError,
    });
  };
  const uploadPdf = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setNotice({ type: 'error', text: 'Please choose a PDF file.' });
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'PDF files must be smaller than 18 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const [, data] = String(reader.result ?? '').split(',');
      if (!data) {
        setNotice({ type: 'error', text: 'The PDF could not be read.' });
        return;
      }
      setNotice(null);
      importPdf.mutate({ data: {
        filename: file.name,
        data,
        title: null,
        category: 'Imported PDF',
        tags: [],
        url: null,
      } }, {
        onSuccess: (article) => {
          setNotice({ type: 'success', text: `Imported “${article.title}” from PDF.` });
          onRefresh();
        },
        onError: showError,
      });
    };
    reader.onerror = () => setNotice({ type: 'error', text: 'The PDF could not be read.' });
    reader.readAsDataURL(file);
  };
  const uploadJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'JSON files must be smaller than 5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''));
        if (!Array.isArray(parsed)) throw new Error('JSON must contain an array of articles.');
        bulkImport.mutate({ data: { articles: parsed } }, {
          onSuccess: (result) => {
            setNotice({ type: 'success', text: `Imported ${result.imported} article${result.imported === 1 ? '' : 's'}; skipped ${result.skipped}.` });
            onRefresh();
          },
          onError: showError,
        });
      } catch (error) {
        showError(error);
      }
    };
    reader.onerror = () => setNotice({ type: 'error', text: 'The JSON file could not be read.' });
    reader.readAsText(file);
  };
  const submitSeeds = (urls: string[], label: string) => {
    const normalized = urls.map((url) => url.trim()).filter(Boolean);
    if (!normalized.length) {
      setNotice({ type: 'error', text: 'Add at least one Teamcenter KB URL.' });
      return;
    }
    setNotice(null);
    seedUrls.mutate({ data: { urls: normalized } }, {
      onSuccess: (result) => {
        setNotice({ type: 'success', text: `${label}: ${result.added} URL${result.added === 1 ? '' : 's'} added, ${result.skipped} already queued, ${result.invalid} invalid.` });
        onRefresh();
      },
      onError: showError,
    });
  };
  const seedManualUrls = (event: FormEvent) => {
    event.preventDefault();
    submitSeeds(seedText.split(/\r?\n/), 'Seed import complete');
  };
  const quickSeed = () => {
    const urls = Array.from({ length: 210000 - 207868 + 1 }, (_, index) =>
      `https://support.sw.siemens.com/en-US/product/272221135/knowledge-base/KB${String(207868 + index).padStart(9, '0')}_EN_US`,
    );
    submitSeeds(urls, 'Quick seed complete');
  };
  const busy = createArticle.isPending || importPdf.isPending || bulkImport.isPending || seedUrls.isPending;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-border/80 pb-5 md:flex-row md:items-center">
        <div><div className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /><h2 className="text-sm font-extrabold">Add knowledge</h2></div><p className="mt-1 text-[11px] text-muted-foreground">Import Teamcenter documentation without the GTAC crawler.</p></div>
        <div className="flex flex-wrap gap-2">
          <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" onChange={uploadPdf} className="hidden" data-testid="input-upload-pdf" />
          <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-primary/40 hover:bg-cyan-50 disabled:opacity-50" data-testid="button-upload-pdf"><FileText className="h-3.5 w-3.5 text-primary" /> Upload PDF</button>
          <input ref={jsonInputRef} type="file" accept=".json,application/json" onChange={uploadJson} className="hidden" data-testid="input-upload-json" />
          <button type="button" onClick={() => jsonInputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-primary/40 hover:bg-cyan-50 disabled:opacity-50" data-testid="button-upload-json"><Terminal className="h-3.5 w-3.5 text-primary" /> Bulk JSON</button>
        </div>
      </div>
      {notice && <div className={cn('mt-4 rounded-lg border px-3 py-2 text-xs font-semibold', notice.type === 'success' ? 'border-lime-200 bg-lime-50 text-lime-800' : 'border-red-200 bg-red-50 text-red-800')} data-testid={`ingestion-${notice.type}`}>{notice.text}</div>}
       <form onSubmit={seedManualUrls} className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50/50 p-4">
         <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="text-xs font-extrabold text-slate-800">Seed public article URLs</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Paste one Teamcenter KB URL per line. Phase 2 fetches these public pages without authentication.</p></div><button type="button" onClick={quickSeed} disabled={busy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-white px-3 py-2 text-[11px] font-bold text-primary hover:bg-cyan-100 disabled:opacity-50" data-testid="button-quick-seed"><Zap className="h-3.5 w-3.5" /> Quick seed KB range</button></div>
         <textarea value={seedText} onChange={(event) => setSeedText(event.target.value)} placeholder="https://support.sw.siemens.com/en-US/product/272221135/knowledge-base/KB000207868_EN_US&#10;/knowledge-base/PL123456" rows={4} className="mt-3 w-full resize-y rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs outline-none focus:border-primary" data-testid="textarea-seed-urls" />
         <div className="mt-3 flex justify-end"><button type="submit" disabled={busy || !seedText.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold text-white hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-seed-urls"><Upload className="h-3.5 w-3.5" /> {seedUrls.isPending ? 'Seeding…' : 'Add seed URLs'}</button></div>
       </form>
      <form onSubmit={saveArticle} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">Title<input required maxLength={500} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Teamcenter article title" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-normal outline-none focus:border-primary" data-testid="input-article-title" /></label>
        <label className="text-xs font-bold text-slate-700">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-normal outline-none focus:border-primary" data-testid="select-article-category">{articleCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700 md:col-span-2">Content<textarea required maxLength={1000000} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Paste the complete Teamcenter documentation or solution text…" rows={7} className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-primary" data-testid="textarea-article-content" /></label>
        <label className="text-xs font-bold text-slate-700">Tags<span className="ml-1 font-normal text-muted-foreground">(comma separated)</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="BMIDE, deployment, data model" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-normal outline-none focus:border-primary" data-testid="input-article-tags" /></label>
        <label className="text-xs font-bold text-slate-700">Source URL<span className="ml-1 font-normal text-muted-foreground">(optional)</span><input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://support.sw.siemens.com/…" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-normal outline-none focus:border-primary" data-testid="input-article-url" /></label>
        <div className="flex justify-end md:col-span-2"><button type="submit" disabled={busy || !form.title.trim() || !form.content.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-white hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-article"><Save className="h-3.5 w-3.5" /> {createArticle.isPending ? 'Saving…' : 'Save article'}</button></div>
      </form>
    </section>
  );
}

function AdminPage() {
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const params = useMemo(() => ({ search: search || undefined, limit: 50 }), [search]);
  const stats = useGetStats({ query: { queryKey: getGetStatsQueryKey(), staleTime: 30000 } });
  const articles = useListArticles(params, { query: { queryKey: getListArticlesQueryKey(params), staleTime: 15000 } });
  const scrapeStatus = useGetScrapeStatus({ query: { queryKey: getGetScrapeStatusQueryKey(), refetchInterval: 3000 } });
  const debug = useDebugScrape();
  const startScrape = useStartScrape();
  const client = useQueryClient();
  const status = scrapeStatus.data;
  const progress = status && status.totalPages > 0 ? Math.min(100, (status.currentPage / status.totalPages) * 100) : 0;

  const runSearch = (event: FormEvent) => { event.preventDefault(); setSearch(searchDraft.trim()); };
  const startIndex = () => startScrape.mutate(undefined, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetScrapeStatusQueryKey() }); client.invalidateQueries({ queryKey: getGetStatsQueryKey() }); }, }); 
  const runDebug = () => debug.refetch();

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background px-4 pb-14 md:px-8 md:pb-16">
      <div className="mx-auto max-w-[1280px]">
         <section className="animate-rise flex flex-col justify-between gap-5 border-b border-border/80 pb-8 pt-9 md:flex-row md:items-end md:pt-12"><div><div className="eyebrow mb-4 flex items-center gap-2 text-primary"><Terminal className="h-3.5 w-3.5" /> Corpus control / 02</div><h1 className="font-display text-4xl font-bold tracking-[-.04em] text-slate-950 md:text-5xl">Index health, at a glance.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Monitor the GTAC collection, add documentation manually, and search the exact material available to the assistant.</p></div><button type="button" onClick={startIndex} disabled={startScrape.isPending || status?.status === 'running'} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-start-scrape">{startScrape.isPending || status?.status === 'running' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{status?.status === 'running' ? 'Indexing in progress' : 'Start index run'}</button></section>
        {startScrape.isError && <div className="mt-5"><QueryError message="The scraper could not be started. Check the API service and try again." retry={startIndex} /></div>}
         <CorpusIngestion onRefresh={() => { client.invalidateQueries({ queryKey: getListArticlesQueryKey(params) }); client.invalidateQueries({ queryKey: getGetStatsQueryKey() }); }} />
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total discovered" value={stats.isLoading ? null : stats.data?.totalArticles} icon={FileText} note="Articles known to crawler" />
          <StatCard label="Indexed for answers" value={stats.isLoading ? null : stats.data?.indexedArticles} icon={Database} note="Available to RAG assistant" accent />
          <StatCard label="Last successful scrape" value={stats.isLoading ? null : stats.data?.lastScraped ? formatDate(stats.data.lastScraped) : 'No completed run'} icon={Clock3} note="Source freshness signal" compact />
          <StatCard label="API service" value={scrapeStatus.isLoading ? 'Checking' : scrapeStatus.isError ? 'Offline' : 'Operational'} icon={Zap} note="Health endpoint response" healthy={!scrapeStatus.isError} compact />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
          <section className="animate-rise animate-rise-delay-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6"><div><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h2 className="text-sm font-extrabold">Indexed articles</h2></div><p className="mt-1 text-[11px] text-muted-foreground">{search ? `Results matching “${search}”` : 'Most recently captured Teamcenter documentation'}</p></div><form onSubmit={runSearch} className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-primary/50 sm:w-64"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search articles" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" data-testid="input-article-search" /><button type="submit" className="rounded-md p-1 text-primary hover:bg-cyan-50" data-testid="button-search-articles" aria-label="Search articles"><ArrowUpRight className="h-3.5 w-3.5" /></button></form></div>{articles.isLoading && <div className="px-6 py-8"><LoadingLines count={6} /></div>}{articles.isError && <div className="p-5"><QueryError retry={() => articles.refetch()} /></div>}{!articles.isLoading && !articles.isError && (!articles.data || articles.data.length === 0) && <div className="flex flex-col items-center px-6 py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground"><Search className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-bold">{search ? 'No indexed articles match' : 'The corpus is empty'}</h3><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{search ? 'Try a broader module name or keyword.' : 'Start an index run to collect Teamcenter source material.'}</p>{search && <button type="button" onClick={() => { setSearch(''); setSearchDraft(''); }} className="mt-4 text-xs font-bold text-primary hover:underline" data-testid="button-clear-search">Clear search</button>}</div>}{articles.data && articles.data.length > 0 && <div className="divide-y divide-border/70">{articles.data.map((article) => <article key={article.id} className="group flex gap-3 px-5 py-4 transition-colors hover:bg-cyan-50/40 md:px-6"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-primary"><FileText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-xs font-bold leading-5 text-slate-800 group-hover:text-primary">{article.title}</h3>{article.url && <a href={article.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-cyan-100 hover:text-primary" data-testid={`link-article-${article.id}`} aria-label={`Open ${article.title}`}><ExternalLink className="h-3.5 w-3.5" /></a>}</div><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{article.content}</p><div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono-ui text-[9px] uppercase tracking-wider text-muted-foreground"><span className="rounded bg-cyan-50 px-1.5 py-0.5 text-primary">{article.category || 'Uncategorized'}</span>{article.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}<span className="ml-auto text-[9px] normal-case tracking-normal">{formatDate(article.scrapedAt)}</span></div></div></article>)}</div>}</section>

          <aside className="space-y-6">
            <section className="animate-rise animate-rise-delay-2 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-100"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><RefreshCw className={cn('h-4 w-4 text-cyan-300', status?.status === 'running' && 'animate-spin')} /><h2 className="text-sm font-extrabold">Scraper telemetry</h2></div><StatusDot status={status?.status === 'error' ? 'error' : status?.status === 'running' ? 'warning' : 'healthy'} label={status?.status === 'running' ? 'Running' : status?.status === 'error' ? 'Error' : 'Idle'} /></div>{scrapeStatus.isLoading && <div className="mt-7"><div className="h-3 w-24 animate-pulse rounded bg-white/10" /><div className="mt-4 h-2 animate-pulse rounded bg-white/10" /></div>}{scrapeStatus.isError && <div className="mt-6"><p className="text-xs text-slate-400">Telemetry is unavailable.</p><button type="button" onClick={() => scrapeStatus.refetch()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-white" data-testid="button-retry-scrape-status"><RefreshCw className="h-3.5 w-3.5" /> Retry status</button></div>}{status && !scrapeStatus.isError && <><div className="mt-7 flex items-end justify-between"><div><div className="font-mono-ui text-2xl font-medium text-cyan-300">{status.currentPage.toLocaleString()}<span className="text-sm text-slate-500"> / {status.totalPages.toLocaleString()}</span></div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Pages traversed</div></div><div className="text-right"><div className="font-display text-2xl font-bold">{status.articlesScraped.toLocaleString()}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Articles captured</div></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all duration-700" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex justify-between font-mono-ui text-[9px] text-slate-500"><span>{progress.toFixed(0)}% complete</span><span>{status.lastRun ? formatDate(status.lastRun) : 'No run yet'}</span></div>{status.lastError && <div className="mt-5 rounded-lg border border-red-400/30 bg-red-950/40 p-3"><div className="font-mono-ui text-[9px] font-bold uppercase tracking-wider text-red-300">Exact scraper error</div><p className="mt-2 break-words text-xs leading-5 text-red-100">{status.lastError}</p><button type="button" onClick={runDebug} disabled={debug.isFetching} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-300 hover:text-white disabled:opacity-50" data-testid="button-debug-scrape"><Search className="h-3 w-3" /> {debug.isFetching ? 'Running GTAC probe…' : 'Run GTAC debug probe'}</button></div>}{debug.data && <div className="mt-4 rounded-lg border border-cyan-400/20 bg-slate-900/70 p-3"><div className="font-mono-ui text-[9px] font-bold uppercase tracking-wider text-cyan-300">GTAC probe · HTTP {debug.data.statusCode}</div><p className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap break-words font-mono-ui text-[10px] leading-4 text-slate-300">{debug.data.bodyPreview || 'Empty response body'}</p></div>}</>}</section>
            <section className="animate-rise animate-rise-delay-3 rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-extrabold">Corpus composition</h2></div><span className="font-mono-ui text-[10px] text-muted-foreground">{stats.data?.categories.length ?? 0} groups</span></div>{stats.isLoading ? <div className="mt-6"><LoadingLines count={4} /></div> : stats.isError ? <div className="mt-5"><QueryError retry={() => stats.refetch()} /></div> : !stats.data?.categories.length ? <p className="mt-6 text-xs text-muted-foreground" data-testid="state-empty-categories">No categories indexed yet.</p> : <div className="mt-6 space-y-4">{stats.data.categories.slice(0, 6).map((category, index) => { const max = Math.max(...stats.data!.categories.map((item) => item.count)); return <div key={category.name}><div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="font-semibold">{category.name}</span><span className="font-mono-ui text-[10px] text-muted-foreground">{category.count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all duration-700', index === 0 ? 'bg-primary' : index === 1 ? 'bg-lime-500' : 'bg-slate-400')} style={{ width: `${(category.count / max) * 100}%` }} /></div></div>; })}</div>}</section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, note, accent = false, healthy = false, compact = false }: { label: string; value: number | string | null | undefined; icon: typeof Database; note: string; accent?: boolean; healthy?: boolean; compact?: boolean }) {
  return <div className={cn('animate-rise rounded-2xl border p-5 shadow-sm', accent ? 'border-primary/30 bg-cyan-50/60' : 'border-border bg-card')}><div className="flex items-center justify-between"><span className="eyebrow text-muted-foreground">{label}</span><div className={cn('grid h-8 w-8 place-items-center rounded-lg', accent ? 'bg-primary text-white' : 'bg-muted text-primary')}><Icon className="h-4 w-4" /></div></div>{value === null ? <div className="mt-5 h-8 w-24 animate-pulse rounded bg-muted" /> : <div className={cn('mt-4 font-display font-bold tracking-tight', compact ? 'text-base leading-5' : 'text-3xl')}>{value ?? '—'}</div>}<div className={cn('mt-2 text-[10px]', healthy ? 'text-lime-700' : 'text-muted-foreground')}>{healthy && <CheckCircle2 className="mr-1 inline h-3 w-3" />}{note}</div></div>;
}

function Router() {
  return <ErrorBoundary><Shell><Switch><Route path="/" component={HomePage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;