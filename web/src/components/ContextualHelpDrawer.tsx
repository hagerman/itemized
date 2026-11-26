import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, X } from "lucide-react";
import type { HelpPage } from "../generated/help";

interface HelpBundle {
  HELP_VERSION: string;
  HELP_PAGES: HelpPage[];
  HELP_SCREEN_MAP: Record<string, string>;
}

interface ContextualHelpDrawerProps {
  target: { kind: "screen" | "slug"; value: string };
  onNavigateSlug: (slug: string) => void;
  onClose: () => void;
}

export const ContextualHelpDrawer: React.FC<ContextualHelpDrawerProps> = ({
  target,
  onNavigateSlug,
  onClose,
}) => {
  const [bundle, setBundle] = useState<HelpBundle | null>(null);

  useEffect(() => {
    let mounted = true;
    import("../generated/help").then((mod) => {
      if (mounted) {
        setBundle({
          HELP_VERSION: mod.HELP_VERSION,
          HELP_PAGES: mod.HELP_PAGES,
          HELP_SCREEN_MAP: mod.HELP_SCREEN_MAP,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const resolvedSlug =
    bundle && target.kind === "screen"
      ? bundle.HELP_SCREEN_MAP[target.value] || "get-started/getting-started"
      : target.value;

  const page = bundle?.HELP_PAGES.find((p) => p.slug === resolvedSlug) ?? bundle?.HELP_PAGES[0];

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("/help/")) {
      e.preventDefault();
      const nextSlug = href.slice("/help/".length).split("#")[0];
      if (nextSlug) onNavigateSlug(nextSlug);
    } else if (/^https?:\/\//i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  };

  return (
    <aside
      role="complementary"
      aria-label="Contextual Help"
      data-testid="contextual-help-drawer"
      className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[82dvh] flex-col rounded-t-2xl border-t border-slate-700 bg-slate-900 text-slate-100 shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[26rem] lg:rounded-none lg:border-l lg:border-t-0"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-indigo-400" />
          <span className="truncate text-sm font-semibold text-white">
            {page ? page.title : "Help"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {page && (
            <Link
              to={`/help/${page.slug}`}
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-slate-800 hover:text-indigo-200"
            >
              Full view <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close contextual help"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div tabIndex={0} className="flex-1 overflow-y-auto px-4 py-4">
        {!bundle || !page ? (
          <p className="text-sm text-slate-400">Loading help guide...</p>
        ) : (
          <article className="help-prose space-y-3 text-sm leading-relaxed text-slate-200">
            <p className="text-xs text-slate-300">{page.summary}</p>
            <div
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          </article>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 text-xs text-slate-400">
        <span>Offline Help {bundle ? `(${bundle.HELP_VERSION})` : ""}</span>
        <Link to="/help" onClick={onClose} className="font-medium text-indigo-300 hover:underline">
          All Help guides
        </Link>
      </div>
    </aside>
  );
};
