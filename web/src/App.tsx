import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, AuthStatus } from "./api";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { CategoriesPage, LocationDetailPage, LocationsPage } from "./pages/TaxonomyPages";
import { SettingsPage } from "./pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

const AppRoutes: React.FC = () => {
  const qc = useQueryClient();
  const { data: authStatus, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => apiFetch<AuthStatus>("/api/auth/status"),
  });

  if (isLoading || !authStatus) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Loading Itemized...</div>;
  }

  if (!authStatus.user) {
    return (
      <AuthPage
        initialized={authStatus.initialized}
        oidcEnabled={authStatus.oidc_enabled}
        onAuthenticated={() => void qc.invalidateQueries({ queryKey: ["auth-status"] })}
      />
    );
  }

  const handleLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    qc.clear();
    void qc.invalidateQueries({ queryKey: ["auth-status"] });
  };

  return (
    <Routes>
      <Route path="/" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Inventory"><ProductsPage /></Layout>} />
      <Route path="/products/new" element={<Layout user={authStatus.user} onLogout={handleLogout} title="New Product"><ProductFormPage /></Layout>} />
      <Route path="/products/:id" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Product"><ProductDetailPage /></Layout>} />
      <Route path="/products/:id/edit" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Edit Product"><ProductFormPage /></Layout>} />
      <Route path="/categories" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Categories"><CategoriesPage /></Layout>} />
      <Route path="/locations" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Locations"><LocationsPage /></Layout>} />
      <Route path="/locations/:id" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Location"><LocationDetailPage /></Layout>} />
      <Route path="/settings" element={<Layout user={authStatus.user} onLogout={handleLogout} title="Settings"><SettingsPage user={authStatus.user} /></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
