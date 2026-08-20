import { useState } from 'react';
import { useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantPage } from './pages/AssistantPage';
import { AdminPage } from './pages/AdminPage';
import { AboutPage } from './pages/AboutPage';
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
  const [auth, setAuth] = useState<{ admin: boolean }>(() => {
    return {
      admin: sessionStorage.getItem('arya_admin_access') === 'true',
    };
  });

  const handleAdminLogin = () => {
    sessionStorage.setItem('arya_admin_access', 'true');
    setAuth({ admin: true });
  };

  if (location === '/about' || location === '/about/') {
    return <AboutPage />;
  }

  // Routes logic
  if (location === '/admin') {
    if (!auth.admin) {
      return <LoginPage onLogin={handleAdminLogin} />;
    }
    return <AdminPage />;
  }

  // The public assistant is intentionally open; only /admin remains protected.
  return <AssistantPage />;
}
