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
  const [auth, setAuth] = useState<{ assistant: boolean; admin: boolean }>(() => {
    return {
      assistant: sessionStorage.getItem('arya_assistant_access') === 'true',
      admin: sessionStorage.getItem('arya_admin_access') === 'true',
    };
  });

  const handleLogin = (area: 'assistant' | 'admin') => {
    sessionStorage.setItem(`arya_${area}_access`, 'true');
    setAuth((current) => ({ ...current, [area]: true }));
  };

  // Routes logic
  if (location === '/admin') {
    if (!auth.admin) {
      return <LoginPage area="admin" onLogin={() => handleLogin('admin')} />;
    }
    return <AdminPage />;
  }

  // Default to assistant
  if (!auth.assistant) {
    return <LoginPage area="assistant" onLogin={() => handleLogin('assistant')} />;
  }
  
  return <AssistantPage />;
}
