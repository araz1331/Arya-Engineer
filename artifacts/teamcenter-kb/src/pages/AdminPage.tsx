import { useState, useRef, FormEvent, ChangeEvent, useEffect } from 'react';
import { 
  useGetStats, useListArticles, useStartScrape, useGetScrapeStatus, 
  useCreateArticle, useImportPdfArticle, useBulkImportArticles, useSeedScrapeUrls, 
  useGetArticleCount, getGetStatsQueryKey, getGetArticleCountQueryKey, getGetScrapeStatusQueryKey
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import { 
  Activity, Database, Upload, RefreshCw, ChevronLeft, 
  Plus, Search as SearchIcon, AlertCircle, Wrench
} from 'lucide-react';

export function AdminPage() {
  const stats = useGetStats({ query: { queryKey: getGetStatsQueryKey(), staleTime: 30000 } });
  const countQuery = useGetArticleCount({ query: { queryKey: getGetArticleCountQueryKey(), staleTime: 30000 } });
  const scrapeStatus = useGetScrapeStatus({ query: { queryKey: getGetScrapeStatusQueryKey(), refetchInterval: 5000 } });
  const startScrape = useStartScrape();

  useEffect(() => {
    const events = new EventSource('/api/scrape/events');
    events.addEventListener('progress', (event) => {
      try {
        const nextStatus = JSON.parse((event as MessageEvent).data);
        scrapeStatus.refetch();
        if (nextStatus.status === 'complete' || nextStatus.status === 'error') {
          stats.refetch();
          countQuery.refetch();
        }
      } catch {
        // The polling query remains the safe fallback if an event is malformed.
      }
    });
    return () => events.close();
  }, []);
  
  const handleScrape = () => {
    startScrape.mutate(undefined, {
      onSuccess: () => {
        scrapeStatus.refetch();
      }
    });
  };

  const isScraping = scrapeStatus.data?.status === 'running';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-16">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="w-5 h-5" />
            <span className="font-semibold tracking-wide text-foreground">Arya Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className={`w-2 h-2 rounded-full ${stats.isError ? 'bg-destructive' : 'bg-primary'}`} />
          {stats.isError ? 'System Error' : 'System Online'}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Corpus Size</span>
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div className="text-4xl font-light tracking-tight">
              {stats.isLoading ? '...' : stats.data?.indexedArticles.toLocaleString() || '0'}
            </div>
            <div className="text-sm text-muted-foreground mt-3 font-mono">
              Total discovered: {countQuery.data?.count || 0}
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm md:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Scraper Status</span>
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xl font-medium mb-1">
                  {scrapeStatus.isLoading ? 'Checking status...' : scrapeStatus.data?.status === 'running' ? 'Scraping in progress' : 'Scraper is idle'}
                </div>
                <div className="text-sm text-muted-foreground font-mono">
                  {scrapeStatus.data?.status === 'running' && (
                    <span>Phase: {scrapeStatus.data.phase} ({scrapeStatus.data.currentPage}/{scrapeStatus.data.totalPages})</span>
                  )}
                  {scrapeStatus.data?.status !== 'running' && (
                    <span>Last run: {scrapeStatus.data?.lastRun ? new Date(scrapeStatus.data.lastRun).toLocaleString() : 'Never'}</span>
                  )}
                </div>
              </div>
              <button 
                onClick={handleScrape}
                disabled={isScraping || startScrape.isPending}
                className="bg-primary text-primary-foreground px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <RefreshCw className={`w-4 h-4 ${isScraping ? 'animate-spin' : ''}`} />
                {isScraping ? 'Running...' : 'Run Scraper'}
              </button>
            </div>
          </div>
        </div>

        <CorpusIngestion onRefresh={() => { stats.refetch(); countQuery.refetch(); }} />
        <ArticleList />
      </main>
    </div>
  );
}

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
    if (file.size > 18 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'PDF files must be smaller than 18 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const [, data] = String(reader.result ?? '').split(',');
      if (!data) return;
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
    reader.readAsDataURL(file);
  };

  const uploadJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''));
        bulkImport.mutate({ data: { articles: parsed } }, {
          onSuccess: (result) => {
            setNotice({ type: 'success', text: `Imported ${result.imported} articles; skipped ${result.skipped}.` });
            onRefresh();
          },
          onError: showError,
        });
      } catch (error) {
        showError(error);
      }
    };
    reader.readAsText(file);
  };

  const submitSeeds = (urls: string[], label: string) => {
    const normalized = urls.map((url) => url.trim()).filter(Boolean);
    if (!normalized.length) return;
    seedUrls.mutate({ data: { urls: normalized } }, {
      onSuccess: (result) => {
        setNotice({ type: 'success', text: `${label}: ${result.added} added, ${result.skipped} skipped.` });
        onRefresh();
      },
      onError: showError,
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-lg font-medium">Add Knowledge</h2>
          <p className="text-sm text-muted-foreground mt-1">Import documentation to the corpus</p>
        </div>
        <div className="flex gap-3">
          <input ref={pdfInputRef} type="file" accept=".pdf" onChange={uploadPdf} className="hidden" />
          <input ref={jsonInputRef} type="file" accept=".json" onChange={uploadJson} className="hidden" />
          <button onClick={() => pdfInputRef.current?.click()} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-muted active:scale-95 transition-all flex items-center gap-2">
            <Upload className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => jsonInputRef.current?.click()} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-muted active:scale-95 transition-all flex items-center gap-2">
            <Upload className="w-4 h-4" /> JSON
          </button>
        </div>
      </div>
      
      {notice && (
        <div className={`p-4 rounded-xl mb-8 text-sm flex items-start gap-3 ${notice.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
          {notice.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <Activity className="w-5 h-5 shrink-0" />}
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <form onSubmit={saveArticle} className="space-y-4">
          <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground">Manual Entry</h3>
          <input 
            type="text" 
            placeholder="Title" 
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            required 
          />
          <textarea 
            placeholder="Content" 
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all h-36 resize-none"
            required
          />
          <input 
            type="text" 
            placeholder="URL (optional)" 
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
          <button type="submit" disabled={createArticle.isPending} className="bg-primary text-primary-foreground px-4 py-3 rounded-xl text-sm font-medium w-full flex justify-center items-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50">
            <Plus className="w-5 h-5" /> Save Article
          </button>
        </form>

        <form onSubmit={(e) => { e.preventDefault(); submitSeeds(seedText.split('\n'), 'Seed URLs'); }} className="space-y-4">
          <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground">Seed URLs</h3>
          <textarea 
            placeholder="https://support.sw.siemens.com/..." 
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all h-52 resize-none font-mono"
            required
          />
          <button type="submit" disabled={seedUrls.isPending} className="bg-background border border-border hover:bg-muted text-foreground px-4 py-3 rounded-xl text-sm font-medium w-full active:scale-[0.98] transition-all disabled:opacity-50">
            Queue for Scraper
          </button>
        </form>
      </div>
    </div>
  );
}

function ArticleList() {
  const [search, setSearch] = useState('');
  const list = useListArticles({ search, limit: 50 }, { query: { queryKey: ['articles', search] } });

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <h2 className="text-lg font-medium">Knowledge Corpus</h2>
        <div className="relative w-full sm:w-72">
          <SearchIcon className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search articles..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
      </div>
      
      <div className="space-y-3">
        {list.isLoading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Loading corpus...</div>
        ) : list.isError ? (
          <div className="text-sm text-destructive py-4 text-center">Failed to load articles.</div>
        ) : list.data?.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No articles found matching "{search}".</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.data?.map((article) => (
              <div key={article.id} className="p-4 border border-border/50 rounded-xl bg-background hover:border-primary/50 transition-colors flex flex-col justify-between">
                <div className="font-medium text-sm mb-2 line-clamp-2 leading-relaxed">{article.title}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="px-2 py-1 rounded bg-muted text-xs text-muted-foreground font-mono truncate max-w-[60%]">
                    {article.category || 'Uncategorized'}
                  </span>
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline font-medium">
                      Source &rarr;
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
