import { useState } from 'react';
import { useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantPage } from './pages/AssistantPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}

function Router() {
  const [location] = useLocation();
  const [auth, setAuth] = useState<{ area: 'assistant' | 'admin' } | null>(() => {
    try {
      const saved = sessionStorage.getItem('arya_auth');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (area: 'assistant' | 'admin') => {
    const data = { area };
    sessionStorage.setItem('arya_auth', JSON.stringify(data));
    setAuth(data);
  };

  // Routes logic
  if (location === '/admin') {
    if (auth?.area !== 'admin') {
      return <LoginPage area="admin" onLogin={() => handleLogin('admin')} />;
    }
    return <AdminPage />;
  }

  // Default to assistant
  if (auth?.area !== 'assistant' && auth?.area !== 'admin') {
    return <LoginPage area="assistant" onLogin={() => handleLogin('assistant')} />;
  }
  
  return <AssistantPage />;
}
