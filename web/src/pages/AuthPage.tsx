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
  const oidcLoginHref = (() => {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const search = typeof window !== "undefined" ? window.location.search : "";
    if (!pathname || pathname === "/" || pathname === "/login") {
      return "/api/auth/oidc/login";
    }
    return `/api/auth/oidc/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
  })();

  useEffect(() => {
    if (!forceOidc) return;
    const redirect = onOidcRedirect ?? ((url: string) => window.location.assign(url));
    redirect(oidcLoginHref);
  }, [forceOidc, oidcLoginHref, onOidcRedirect]);

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
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4 pt-[calc(1rem+env(safe-area-inset-top))] dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo className="mb-3 h-12 w-12" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">itemized</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
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
              href={oidcLoginHref}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
            >
              <KeyRound className="h-4 w-4" /> Sign in with OIDC
            </a>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Email address
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Password {!initialized && <span className="text-slate-500">(min 8 chars)</span>}
                <input
                  type="password"
                  required
                  minLength={initialized ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? "Please wait..." : initialized ? "Sign In" : "Create Admin Account"}
              </button>
            </form>

            {initialized && oidcEnabled && (
              <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
                <a
                  href={oidcLoginHref}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
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
