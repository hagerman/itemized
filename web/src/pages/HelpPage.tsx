import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ExternalLink, Search } from "lucide-react";
import {
  HELP_PAGES,
  HELP_TASK_ENTRIES,
  HELP_VERSION,
  HelpPage as HelpPageData,
} from "../generated/help";

const ENTRY_LABELS: Record<string, string> = {
  "get-started": "Get started",
  use: "Use itemized",
  configure: "Configure & connect",
};

export const HelpPage: React.FC = () => {
  const params = useParams();
  const slug = params["*"];
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const activePage: HelpPageData | undefined = useMemo(
    () => (slug ? HELP_PAGES.find((p) => p.slug === slug) : undefined),
    [slug]
  );

  useEffect(() => {
    if (!slug) {
      searchInputRef.current?.focus();
    }
  }, [slug]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    return HELP_PAGES.filter((p) => {
      const hay = p.searchText.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [query]);

  const handleArticleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("/help/")) {
      e.preventDefault();
      navigate(href);
    } else if (/^https?:\/\//i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  };

  if (slug && activePage) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Help
          </Link>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
            Version {HELP_VERSION}
          </span>
        </div>

        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{activePage.title}</h2>
          <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">{activePage.summary}</p>
          <div
            className="help-prose mt-5 space-y-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200"
            onClick={handleArticleClick}
            dangerouslySetInnerHTML={{ __html: activePage.html }}
          />
        </article>
      </div>
    );
  }

  const grouped = ["get-started", "use", "configure"].map((ep) => ({
    id: ep,
    label: ENTRY_LABELS[ep] || ep,
    pages: HELP_PAGES.filter((p) => p.entryPoint === ep),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section aria-label="Search Help" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="help-search-input" className="text-sm font-semibold text-slate-900 dark:text-white">
            Search offline Help
          </label>
          <span className="text-xs text-slate-700 dark:text-slate-300">Version {HELP_VERSION}</span>
        </div>
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
          <input
            ref={searchInputRef}
            id="help-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides (e.g. ZPL, freezer, shopping list, shortcuts)..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-2.5 pl-9 pr-3 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs text-slate-700 dark:text-slate-300">
          {query.trim()
            ? searchResults.length === 1
              ? "1 guide found"
              : `${searchResults.length} guides found`
            : ""}
        </div>
        {query.trim() && (
          <ul className="mt-2 space-y-2">
            {searchResults.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/help/${p.slug}`}
                  className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 px-4 py-3 hover:border-indigo-400"
                >
                  <div className="font-semibold text-indigo-700 dark:text-indigo-300">{p.title}</div>
                  <div className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">{p.summary}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="help-tasks-heading" className="space-y-3">
        <h2 id="help-tasks-heading" className="text-base font-semibold text-slate-900 dark:text-white">
          Common tasks
        </h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_TASK_ENTRIES.map((entry) =>
            entry.external ? (
              <a
                key={entry.label}
                href={entry.slug}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:border-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
              >
                <span>{entry.label}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-400" />
              </a>
            ) : (
              <Link
                key={entry.label}
                to={`/help/${entry.slug}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:border-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
              >
                <span>{entry.label}</span>
                <BookOpen className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              </Link>
            )
          )}
        </div>
      </section>

      <section aria-labelledby="help-guides-heading" className="space-y-4">
        <h2 id="help-guides-heading" className="text-base font-semibold text-slate-900 dark:text-white">
          All user guides
        </h2>
        {grouped.map((group) => (
          <div key={group.id} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {group.label}
            </h3>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {group.pages.map((p) => (
                <li key={p.slug}>
                  <Link
                    to={`/help/${p.slug}`}
                    className="block h-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 hover:border-indigo-400"
                  >
                    <div className="font-semibold text-indigo-700 dark:text-indigo-300">{p.title}</div>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{p.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
};

export default HelpPage;
