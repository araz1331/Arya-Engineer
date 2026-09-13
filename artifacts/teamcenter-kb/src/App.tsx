import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantPage } from './pages/AssistantPage';
import { AdminPage } from './pages/AdminPage';
import { AboutPage } from './pages/AboutPage';
import { LoginPage } from './pages/LoginPage';
import {
  ADMIN_LOGOUT_EVENT,
  getAdminToken,
  handleAdminUnauthorized,
  initAdminAuth,
  isUnauthorizedError,
  setAdminToken,
} from './lib/adminAuth';

initAdminAuth();

const onApiError = (error: unknown) => {
  if (isUnauthorizedError(error) && getAdminToken()) handleAdminUnauthorized();
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 3,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}

function Router() {
  const [location] = useLocation();
  const [isAdmin, setIsAdmin] = useState(() => getAdminToken() !== null);

  useEffect(() => {
    const onLogout = () => {
      setIsAdmin(false);
      queryClient.removeQueries();
    };
    window.addEventListener(ADMIN_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(ADMIN_LOGOUT_EVENT, onLogout);
  }, []);

  const handleAdminLogin = (token: string, expiresAt: number) => {
    setAdminToken(token, expiresAt);
    setIsAdmin(true);
  };

  if (location === '/about' || location === '/about/') {
    return <AboutPage />;
  }

  // Routes logic
  if (location === '/admin') {
    // The server enforces admin auth; this only decides whether to show the login form.
    if (!isAdmin || getAdminToken() === null) {
      return <LoginPage onLogin={handleAdminLogin} />;
    }
    return <AdminPage />;
  }

  // The public assistant is intentionally open; only /admin remains protected.
  return <AssistantPage />;
}
