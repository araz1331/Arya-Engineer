import { Check, ChevronRight, Download, MoreVertical, Plus, Share, Smartphone, X } from 'lucide-react';

export type InstallPlatform = 'ios' | 'android' | 'desktop';

type InstallGuideModalProps = {
  platform: InstallPlatform;
  onGotIt: () => void;
  onRemindLater: () => void;
};

function StepIllustration({ platform, step }: { platform: InstallPlatform; step: number }) {
  const isIos = platform === 'ios';
  return (
    <div className="relative flex h-28 w-24 shrink-0 items-center justify-center rounded-2xl border border-border bg-background shadow-inner">
      <div className="absolute top-2 h-1 w-8 rounded-full bg-border" />
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
        {step === 1 ? (isIos ? <Share className="h-8 w-8" /> : <MoreVertical className="h-8 w-8" />) : step === 2 ? <Plus className="h-8 w-8" /> : <Check className="h-8 w-8" />}
      </div>
      <div className="absolute bottom-2 flex items-center gap-1 text-[8px] text-muted-foreground">
        {isIos ? 'Safari' : platform === 'android' ? 'Chrome' : 'Browser'}
        <ChevronRight className="h-2.5 w-2.5" />
      </div>
    </div>
  );
}

export function InstallGuideModal({ platform, onGotIt, onRemindLater }: InstallGuideModalProps) {
  const isIos = platform === 'ios';
  const isAndroid = platform === 'android';
  const title = isIos || isAndroid
    ? 'Add Arya Engineer to your home screen for instant access'
    : 'Install Arya Engineer for instant access';

  const steps = isIos
    ? [
        'Tap the Share button (box with arrow) in Safari',
        'Scroll down and tap “Add to Home Screen”',
        'Tap “Add” — done!',
      ]
    : isAndroid
      ? [
          'Tap the three dots menu in Chrome',
          'Tap “Add to Home Screen”',
          'Tap “Add” — done!',
        ]
      : [
          'Use your browser’s install icon or menu',
          'Choose “Install Arya Engineer”',
          'Confirm by tapping “Install” — done!',
        ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-border bg-card p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Quick setup</p>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-foreground">{title}</h2>
            </div>
          </div>
          <button onClick={onRemindLater} aria-label="Close install guide" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <Smartphone className="h-5 w-5 shrink-0 text-primary" />
          <span>Open Arya Engineer like a native app, even when you are offline.</span>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-4 rounded-2xl border border-border bg-background/60 p-3">
              <StepIllustration platform={platform} step={index + 1} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Step {index + 1}</p>
                <p className="mt-1 text-sm leading-5 text-foreground">{step}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button onClick={onGotIt} className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[.98]">
            Got it
          </button>
          <button onClick={onRemindLater} className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}