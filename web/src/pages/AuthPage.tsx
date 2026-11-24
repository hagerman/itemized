import React, { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { apiFetch, User } from "../api";
import { BrandLogo } from "../components/BrandLogo";

interface AuthPageProps {
  initialized: boolean;
  oidcEnabled: boolean;
  oidcForce: boolean;
  onAuthenticated: (user: User) => void;
  onOidcRedirect?: (url: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialized,
  oidcEnabled,
  oidcForce,
  onAuthenticated,
  onOidcRedirect,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const forceOidc = initialized && oidcEnabled && oidcForce;

  useEffect(() => {
    if (!forceOidc) return;
    const redirect = onOidcRedirect ?? ((url: string) => window.location.assign(url));
    redirect("/api/auth/oidc/login");
  }, [forceOidc, onOidcRedirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = initialized ? "/api/auth/login" : "/api/auth/setup";
      const res = await apiFetch<{ user: User }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo className="mb-3 h-12 w-12" />
          <h1 className="text-2xl font-bold text-white">itemized</h1>
          <p className="mt-1 text-sm text-slate-400">
            {forceOidc
              ? "Redirecting to your identity provider..."
              : initialized
                ? "Sign in to your household inventory"
                : "First-run setup: create your administrator account"}
          </p>
        </div>

        {forceOidc ? (
          <div className="space-y-4 text-center">
            <a
              href="/api/auth/oidc/login"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <KeyRound className="h-4 w-4" /> Sign in with OIDC
            </a>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-xs font-medium text-slate-300">
                Email address
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-300">
                Password {!initialized && <span className="text-slate-500">(min 8 chars)</span>}
                <input
                  type="password"
                  required
                  minLength={initialized ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? "Please wait..." : initialized ? "Sign In" : "Create Admin Account"}
              </button>
            </form>

            {initialized && oidcEnabled && (
              <div className="mt-5 border-t border-slate-800 pt-5">
                <a
                  href="/api/auth/oidc/login"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-700"
                >
                  <KeyRound className="h-4 w-4" /> Sign in with OIDC
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
