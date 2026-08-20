import { useState } from 'react';
import { useLogin } from '@workspace/api-client-react';
import { Wrench, ArrowRight, Loader2, Lock } from 'lucide-react';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError('');
    login.mutate(
      { data: { password, area: 'admin' } },
      {
        onSuccess: (res) => {
          if (res.authenticated) {
            onLogin();
          } else {
            setError('Wrong password');
          }
        },
        onError: () => {
            setError('Wrong password');
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex items-center gap-2 text-primary mb-12">
          <Wrench className="w-7 h-7" />
          <span className="text-2xl font-semibold tracking-wide">Arya Engineer</span>
        </div>
        
        <div className={`w-full bg-card border border-border rounded-3xl p-8 shadow-2xl ${error ? 'animate-[shake_.35s_ease-in-out]' : ''}`}>
          <div className="flex items-center justify-center w-14 h-14 bg-muted rounded-full mb-6 mx-auto text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-center font-medium text-xl mb-2">
            Admin access
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-8">
            Enter password to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-background border border-border rounded-xl px-4 py-4 text-center text-lg tracking-widest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button
              type="submit"
              disabled={login.isPending || !password}
              className="w-full bg-primary text-primary-foreground font-medium rounded-xl px-4 py-4 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {login.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter'}
              {!login.isPending && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
