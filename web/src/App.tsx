import React, { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, AuthStatus } from "./api";
import { HelpProvider } from "./components/HelpContext";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { SearchPage } from "./pages/SearchPage";
import { CategoriesPage, LocationDetailPage, LocationsPage } from "./pages/TaxonomyPages";
import { SettingsPage } from "./pages/SettingsPage";

const LazyHelpPage = React.lazy(() => import("./pages/HelpPage"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export interface AppRoutesProps {
  onOidcRedirect?: (url: string) => void;
}

export const AppRoutes: React.FC<AppRoutesProps> = ({ onOidcRedirect }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: authStatus, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => apiFetch<AuthStatus>("/api/auth/status"),
  });

  if (isLoading || !authStatus) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Loading itemized...</div>;
  }

  if (!authStatus.user) {
    return (
      <AuthPage
        initialized={authStatus.initialized}
        oidcEnabled={authStatus.oidc_enabled}
        oidcForce={authStatus.oidc_force}
        onAuthenticated={() => void qc.invalidateQueries({ queryKey: ["auth-status"] })}
        onOidcRedirect={onOidcRedirect}
      />
    );
  }

  const demoMode = Boolean(authStatus.demo_mode);
  const demoResetAt = authStatus.demo_reset_at;

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed with client-side cleanup and re-verify auth status with the server.
    } finally {
      await qc.cancelQueries();
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth-status" });
      qc.setQueryData<AuthStatus>(["auth-status"], (prev) => (prev ? { ...prev, user: null } : prev));
      navigate("/", { replace: true });
      void qc.invalidateQueries({ queryKey: ["auth-status"] });
    }
  };

  return (
    <Routes>
      <Route path="/" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Inventory" demoMode={demoMode} demoResetAt={demoResetAt}><ProductsPage /></Layout>} />
      <Route path="/search" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Search" demoMode={demoMode} demoResetAt={demoResetAt}><SearchPage /></Layout>} />
      <Route path="/products/new" element={<Layout user={authStatus.user} onLogout={handleLogout} title="New Product" demoMode={demoMode} demoResetAt={demoResetAt}><ProductFormPage /></Layout>} />
      <Route path="/products/:id" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Product" demoMode={demoMode} demoResetAt={demoResetAt}><ProductDetailPage /></Layout>} />
      <Route path="/products/:id/edit" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Edit Product" demoMode={demoMode} demoResetAt={demoResetAt}><ProductFormPage /></Layout>} />
      <Route path="/categories" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Categories" demoMode={demoMode} demoResetAt={demoResetAt}><CategoriesPage /></Layout>} />
      <Route path="/locations" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Locations" demoMode={demoMode} demoResetAt={demoResetAt}><LocationsPage /></Layout>} />
      <Route path="/locations/:id" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Location" demoMode={demoMode} demoResetAt={demoResetAt}><LocationDetailPage /></Layout>} />
      <Route path="/settings" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Settings" demoMode={demoMode} demoResetAt={demoResetAt}><SettingsPage user={authStatus.user} demoMode={demoMode} /></Layout>} />
      <Route path="/help" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Help" demoMode={demoMode} demoResetAt={demoResetAt}><Suspense fallback={<div className="text-sm text-slate-400">Loading Help...</div>}><LazyHelpPage /></Suspense></Layout>} />
      <Route path="/help/*" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Help" demoMode={demoMode} demoResetAt={demoResetAt}><Suspense fallback={<div className="text-sm text-slate-400">Loading Help...</div>}><LazyHelpPage /></Suspense></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <HelpProvider>
        <AppRoutes />
      </HelpProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
