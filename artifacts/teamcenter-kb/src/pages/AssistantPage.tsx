import { useEffect, useRef, useState } from 'react';
import { useChat } from '@workspace/api-client-react';
import { Wrench, Camera, Send, X, Share, Link as LinkIcon, RefreshCcw, Loader2, AlertCircle, ShieldCheck, Mic, MicOff, Download } from 'lucide-react';
import { ImageAnnotator } from '../components/ImageAnnotator';
import { InstallGuideModal, type InstallPlatform } from '../components/InstallGuideModal';

const UI_COPY = {
  headline: 'Stuck in Teamcenter?',
  subtitle: 'Photo or text — get an answer in seconds',
  placeholder: 'Describe your problem or upload a screenshot...',
  taps: ['I see an error', 'How to do this?', "Can't login"],
  cameraZone: 'Take or upload a screenshot',
  dropHint: 'Click to choose, or drag and drop an image here',
  share: 'Share',
  sources: 'Sources',
  askAnother: 'Ask follow-up',
  snap: 'Screenshot uploaded',
  send: 'Send',
  drop: 'Drop image here',
  analyzing: 'Finding an answer…',
  analyzingCopy: 'Looking at your Teamcenter issue now.',
  listening: 'Listening…',
  voiceLabel: 'Speak your question',
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BeforeInstallPromptLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function AssistantPage() {
  const t = UI_COPY;
  
  const [question, setQuestion] = useState('');
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ name: string; data: string; mimeType: 'image/png' | 'image/jpeg'; preview: string } | null>(null);
  const [reply, setReply] = useState<any>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('desktop');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const deferredInstallPromptRef = useRef<BeforeInstallPromptLike | null>(null);
  const chat = useChat();
  const speechSupported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );

  useEffect(() => {
    const userAgent = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      setInstallPlatform('ios');
    } else if (/Android/i.test(userAgent)) {
      setInstallPlatform('android');
    }

    const wasCompleted = localStorage.getItem('arya_pwa_onboarding_complete') === 'true';
    const wasSeenThisSession = sessionStorage.getItem('arya_pwa_onboarding_seen') === 'true';
    if (!isStandalone && !wasCompleted && !wasSeenThisSession) {
      sessionStorage.setItem('arya_pwa_onboarding_seen', 'true');
      setIsInstallGuideOpen(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredInstallPromptRef.current = event as BeforeInstallPromptLike;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, [isStandalone]);

  const dismissInstallGuide = () => setIsInstallGuideOpen(false);
  const completeInstallGuide = async () => {
    localStorage.setItem('arya_pwa_onboarding_complete', 'true');
    setIsInstallGuideOpen(false);
    const prompt = deferredInstallPromptRef.current;
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      deferredInstallPromptRef.current = null;
    }
  };

  const handleImageFile = (file: File | undefined) => {
    if (file?.type.startsWith('image/')) setRawFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleImageFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDraggingImage(true);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDraggingImage(false);
    handleImageFile(e.dataTransfer.files?.[0]);
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = (window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition || (window as Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        setQuestion((current) => `${current} ${transcript}`.trim());
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      speechRecognitionRef.current = null;
    };
    recognition.onerror = () => {
      setIsListening(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const submitQuestion = () => {
    if (!question.trim() && !attachedImage) return;
    setSubmittedQuestion(question.trim() || t.snap);
    setReply(null);
    chat.mutate({
      data: {
        message: question.trim() || t.placeholder,
        sessionId,
        imageData: attachedImage?.data || null,
        imageMimeType: attachedImage?.mimeType || null
      }
    }, {
      onSuccess: (data) => {
        setReply(data);
        setSessionId(data.sessionId);
      }
    });
  };

  const handleShare = () => {
    if (!reply) return;
    const shareData = {
        title: 'Teamcenter Solution',
        text: reply.answer
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => navigator.clipboard?.writeText(reply.answer));
      return;
    }
    navigator.clipboard?.writeText(reply.answer);
  };

  if (rawFile) {
    return (
      <ImageAnnotator 
        file={rawFile} 
        onComplete={(img) => {
          setAttachedImage(img);
          setRawFile(null);
        }}
        onCancel={() => setRawFile(null)}
      />
    );
  }

  // Error View
  if (chat.isError) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-6" />
        <p className="text-xl font-medium mb-2">Connection Error</p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-8">
          We could not reach the assistant. Please check your connection and try again.
        </p>
        <button 
          onClick={() => chat.reset()} 
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium active:scale-95 transition-transform"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Pending View
  if (chat.isPending) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
        <p className="text-xl font-medium mb-2">
          {t.analyzing}
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {t.analyzingCopy}
        </p>
      </div>
    );
  }

  // Answer View
  if (reply) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-border bg-card/50">
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="w-5 h-5" />
            <span className="font-semibold tracking-wide">Arya</span>
          </div>
            <div className="rounded-full border border-primary/30 px-2.5 py-1 text-[10px] font-medium text-primary">Arya Engineer</div>
        </header>
        
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="bg-muted text-foreground p-4 rounded-2xl rounded-br-sm text-sm mb-6 max-w-[85%] ml-auto shadow-sm">
            {submittedQuestion}
            {attachedImage && (
              <img src={attachedImage.preview} alt="Attached" className="mt-3 rounded-lg w-full object-cover border border-border/50" />
            )}
          </div>
          
          <div className="bg-card border border-border p-5 rounded-2xl rounded-tl-sm text-sm text-foreground leading-relaxed shadow-sm mb-8">
            <div className="whitespace-pre-wrap">{reply.answer}</div>
          </div>
          
          {reply.sources && reply.sources.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <LinkIcon className="w-3 h-3" />
                {t.sources}
              </h3>
              <div className="flex flex-wrap gap-2">
                {reply.sources.map((s: any) => (
                  <a 
                    key={s.id} 
                    href={s.url || '#'} 
                    target={s.url ? "_blank" : undefined}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium hover:border-primary/50 active:bg-muted transition-colors"
                  >
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{s.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </main>
        
        <footer className="p-4 border-t border-border bg-background grid grid-cols-2 gap-3">
          <button 
            onClick={handleShare}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border border-border font-medium text-sm text-foreground active:bg-muted transition-colors"
          >
            <Share className="w-4 h-4" />
            {t.share}
          </button>
          <button 
            onClick={() => {
              setReply(null);
              setQuestion('');
              setAttachedImage(null);
              setSubmittedQuestion('');
            }}
            className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm active:scale-[0.98] transition-all"
          >
            <RefreshCcw className="w-4 h-4" />
            {t.askAnother}
          </button>
        </footer>
      </div>
    );
  }

  // Idle View
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="flex items-center justify-between p-4 bg-background z-10 sticky top-0 border-b border-border/50">
        <div className="flex items-center gap-2 text-primary">
          <Wrench className="w-6 h-6" />
          <span className="font-semibold text-lg tracking-wide text-foreground">Arya Engineer</span>
        </div>
        {!isStandalone && (
          <button
            onClick={() => setIsInstallGuideOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Install app
          </button>
        )}
      </header>

      <main className="flex-1 p-4 pb-8 max-w-2xl mx-auto w-full">
        <section className="pt-7 pb-6">
          <h1 className="mt-3 max-w-sm text-4xl font-semibold leading-[1.05] tracking-tight text-foreground">{t.headline}</h1>
          <p className="mt-3 max-w-sm text-base leading-6 text-muted-foreground">{t.subtitle}</p>
        </section>

        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          className="hidden" 
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDraggingImage(false);
          }}
          onDrop={handleDrop}
          aria-label={t.snap}
          className={`relative flex min-h-[35dvh] w-full flex-col items-center justify-center overflow-hidden rounded-[2rem] border-2 bg-primary text-primary-foreground shadow-[0_20px_50px_rgba(20,184,166,.2)] active:scale-[.985] transition-all ${
            isDraggingImage
              ? 'border-dashed border-white bg-primary/80 shadow-[0_0_0_4px_rgba(255,255,255,.18),0_20px_50px_rgba(20,184,166,.2)]'
              : 'border-solid border-primary/40'
          }`}
        >
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,.25),transparent_40%)]" />
          <span className={`relative grid h-20 w-20 place-items-center rounded-full border border-primary-foreground/30 bg-primary-foreground/10 ${isDraggingImage ? 'scale-110' : ''} transition-transform`}>
            <Camera className="h-9 w-9" />
          </span>
          <span className="relative mt-5 text-xl font-semibold">{isDraggingImage ? t.drop : t.cameraZone}</span>
          <span className="relative mt-1 text-sm text-primary-foreground/75">
            {isDraggingImage ? 'PNG, JPG or WEBP' : t.dropHint}
          </span>
        </button>

        <div className="mt-5 bg-card border border-border rounded-2xl p-3 shadow-lg flex flex-col gap-3 relative focus-within:border-primary/50 transition-colors">
          {attachedImage && (
            <div className="relative w-max mt-2 ml-2">
              <img src={attachedImage.preview} alt="Attached" className="h-16 w-16 object-cover rounded-xl border border-border" />
              <button 
                onClick={() => setAttachedImage(null)}
                className="absolute -top-2 -right-2 bg-foreground text-background rounded-full p-1 shadow-sm active:scale-95 transition-transform"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.placeholder}
            className="w-full bg-transparent resize-none outline-none text-base min-h-[76px] p-2 placeholder:text-muted-foreground"
            rows={2}
          />
          
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            {speechSupported ? (
              <button
                type="button"
                onClick={toggleVoiceInput}
                aria-label={t.voiceLabel}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isListening ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isListening ? t.listening : t.voiceLabel}
              </button>
            ) : <span />}
            <button 
              onClick={submitQuestion}
              disabled={!question.trim() && !attachedImage}
              className="inline-flex items-center gap-2 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground rounded-xl disabled:opacity-50 active:scale-95 transition-transform shadow-md"
            >
              {t.send}<Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">Ask in any language — I&apos;ll respond in kind</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {t.taps.map(tap => (
            <button
              key={tap}
              onClick={() => setQuestion(tap)}
              className="bg-card border border-border px-3.5 py-2.5 rounded-full text-sm font-medium text-foreground active:bg-muted transition-colors text-left"
            >
              {tap}
            </button>
          ))}
        </div>
        <div className="mt-7 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Your photo stays protected</div>
      </main>
      {isInstallGuideOpen && (
        <InstallGuideModal
          platform={installPlatform}
          onGotIt={completeInstallGuide}
          onRemindLater={dismissInstallGuide}
        />
      )}
    </div>
  );
}
