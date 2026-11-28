export const CARD_CLASS =
  "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none";

export const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";

export const INLINE_INPUT_CLASS =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";

export const LEARN_MORE_CLASS =
  "inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-800 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200";

export interface SettingsFeedbackProps {
  demoMode?: boolean;
  onFlash: (msg: string) => void;
  onError: (msg: string) => void;
}
