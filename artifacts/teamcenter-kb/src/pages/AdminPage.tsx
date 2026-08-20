import { useState, useRef, FormEvent, ChangeEvent } from 'react';
import { 
  useGetStats, useListArticles,
  useCreateArticle, useImportPdfArticle, useBulkImportArticles,
  useGetArticleCount, useListCommunityQuestions, useAnswerCommunityQuestion, useGetFeedbackStats,
  useGetAnalyticsStats, getGetStatsQueryKey, getGetArticleCountQueryKey, getGetAnalyticsStatsQueryKey
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import { 
  Activity, BarChart3, Database, Upload, ChevronLeft,
  Plus, Search as SearchIcon, AlertCircle, Wrench, MessageCircle, ThumbsDown
} from 'lucide-react';

export function AdminPage() {
  const stats = useGetStats({ query: { queryKey: getGetStatsQueryKey(), staleTime: 30000 } });
  const countQuery = useGetArticleCount({ query: { queryKey: getGetArticleCountQueryKey(), staleTime: 30000 } });
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
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Corpus Management</span>
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-4xl font-light tracking-tight">
                {countQuery.isLoading ? '...' : countQuery.data?.count.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-muted-foreground mt-3">Articles in the knowledge base</div>
            </div>
            <Activity className="w-8 h-8 text-primary/30" />
          </div>
        </div>

        <CorpusIngestion onRefresh={() => { stats.refetch(); countQuery.refetch(); }} />
        <AnalyticsPanel />
        <CommunityPanel />
        <ArticleList />
      </main>
    </div>
  );
}

function AnalyticsPanel() {
  const analytics = useGetAnalyticsStats({
    query: {
      queryKey: getGetAnalyticsStatsQueryKey(),
      refetchInterval: 60000,
    },
  });
  const data = analytics.data;
  const month = data?.month;
  const periodCards = [
    { label: 'Today', value: data?.today.uniqueVisitors },
    { label: 'Last 7 days', value: data?.week.uniqueVisitors },
    { label: 'This month', value: data?.month.uniqueVisitors },
  ];
  const metricCards = [
    { label: 'Sessions (month)', value: month?.sessions },
    { label: 'Questions asked', value: month?.questions },
    { label: 'Questions with screenshots', value: month?.screenshotQuestions },
    { label: 'Answers delivered', value: month?.answers },
    { label: 'Expert handoffs', value: month?.expertQuestions },
    { label: 'Positive ratings', value: month?.positiveFeedback },
    { label: 'Negative ratings', value: month?.negativeFeedback },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Analytics</span>
          <p className="mt-1 text-sm text-muted-foreground">Anonymous product usage, refreshed every minute.</p>
        </div>
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>

      {analytics.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading analytics…</div>
      ) : analytics.isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          Analytics could not be loaded.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {periodCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-border bg-background p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unique visitors</div>
                <div className="mt-2 text-3xl font-light">{card.value ?? 0}</div>
                <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metricCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="text-2xl font-light">{card.value ?? 0}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{card.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Popular questions this month</h3>
              {data?.popularQuestions.length ? (
                <div className="space-y-2">
                  {data.popularQuestions.map((item) => (
                    <div key={item.question} className="flex items-start justify-between gap-4 rounded-xl bg-background/70 p-3 text-sm">
                      <span className="leading-5">{item.question}</span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-xl bg-background/70 p-4 text-sm text-muted-foreground">No questions recorded yet.</div>}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">User languages this month</h3>
              {data?.languages.length ? (
                <div className="space-y-2">
                  {data.languages.map((item) => (
                    <div key={item.language} className="flex items-center justify-between rounded-xl bg-background/70 p-3 text-sm">
                      <span>{item.language}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-xl bg-background/70 p-4 text-sm text-muted-foreground">No language data recorded yet.</div>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function CommunityPanel() {
  const [status, setStatus] = useState<'pending' | 'answered' | 'all'>('pending');
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const questions = useListCommunityQuestions({ status }, { query: { queryKey: ['community-questions', status] } });
  const feedback = useGetFeedbackStats({ query: { queryKey: ['feedback-stats'], refetchInterval: 30000 } });
  const answerQuestion = useAnswerCommunityQuestion();

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total responses</div><div className="mt-2 text-3xl font-light">{feedback.data?.totalResponses ?? '—'}</div></div>
        <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Positive answers</div><div className="mt-2 text-3xl font-light">{feedback.data ? `${feedback.data.positivePercentage}%` : '—'}</div></div>
        <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Negative comments</div><div className="mt-2 text-3xl font-light">{feedback.data?.recentNegative.length ?? '—'}</div></div>
      </div>
      {feedback.data?.recentNegative.length ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive"><ThumbsDown className="h-4 w-4" /> Recent negative feedback</div>
          <div className="space-y-2">{feedback.data.recentNegative.map((item) => <div key={item.id} className="rounded-xl bg-background/70 p-3 text-sm"><div>{item.comment || 'No comment provided.'}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></div>)}</div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="flex items-center gap-2 text-lg font-medium"><MessageCircle className="h-5 w-5 text-primary" /> Community questions</h2><p className="mt-1 text-sm text-muted-foreground">Answer pending questions and add expert guidance to the corpus.</p></div>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><option value="pending">Pending</option><option value="answered">Answered</option><option value="all">All</option></select>
        </div>
        {questions.isLoading ? <div className="py-5 text-center text-sm text-muted-foreground">Loading questions…</div> : questions.data?.length ? (
          <div className="space-y-4">{questions.data.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/70 bg-background p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className={`rounded-full px-2 py-1 ${item.status === 'pending' ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>{item.status}</span><span>{item.language}</span><span>{new Date(item.createdAt).toLocaleString()}</span></div>
              <div className="mt-3 text-sm font-medium leading-6">{item.question}</div>
              {item.screenshotRef && <div className="mt-2 text-xs text-muted-foreground">Screenshot reference: {item.screenshotRef}</div>}
              {item.status === 'answered' ? <div className="mt-3 rounded-xl bg-primary/5 p-3 text-sm leading-6">{item.answer}</div> : (
                <div className="mt-4 space-y-2">
                  <textarea value={answerDrafts[item.id] ?? ''} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Write a practical Teamcenter answer…" className="min-h-24 w-full resize-y rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary" />
                  <button type="button" disabled={!answerDrafts[item.id]?.trim() || answerQuestion.isPending} onClick={() => answerQuestion.mutate({ id: item.id, data: { answer: answerDrafts[item.id].trim() } }, { onSuccess: () => { setAnswerDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; }); questions.refetch(); feedback.refetch(); } })} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{answerQuestion.isPending ? 'Saving…' : 'Answer and add to corpus'}</button>
                </div>
              )}
            </div>
          ))}</div>
        ) : <div className="py-5 text-center text-sm text-muted-foreground">No {status === 'all' ? '' : status} questions.</div>}
      </div>
    </section>
  );
}

function CorpusIngestion({ onRefresh }: { onRefresh: () => void }) {
  const [form, setForm] = useState({ title: '', content: '', category: 'Troubleshooting', tags: '', url: '' });
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  
  const createArticle = useCreateArticle();
  const importPdf = useImportPdfArticle();
  const bulkImport = useBulkImportArticles();

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

      <div className="grid grid-cols-1 gap-10">
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
