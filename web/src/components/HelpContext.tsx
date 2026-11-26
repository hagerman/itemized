import React, { createContext, useCallback, useContext, useState } from "react";
import { ContextualHelpDrawer } from "./ContextualHelpDrawer";

interface HelpContextValue {
  activeHelpTarget: string | null;
  openHelpForScreen: (screenId: string) => void;
  openHelpSlug: (slug: string) => void;
  closeHelp: () => void;
}

const HelpContext = createContext<HelpContextValue>({
  activeHelpTarget: null,
  openHelpForScreen: () => {},
  openHelpSlug: () => {},
  closeHelp: () => {},
});

export function useHelp(): HelpContextValue {
  return useContext(HelpContext);
}

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [target, setTarget] = useState<{ kind: "screen" | "slug"; value: string } | null>(null);

  const openHelpForScreen = useCallback((screenId: string) => {
    setTarget({ kind: "screen", value: screenId });
  }, []);

  const openHelpSlug = useCallback((slug: string) => {
    setTarget({ kind: "slug", value: slug });
  }, []);

  const closeHelp = useCallback(() => {
    setTarget(null);
  }, []);

  return (
    <HelpContext.Provider
      value={{
        activeHelpTarget: target?.value ?? null,
        openHelpForScreen,
        openHelpSlug,
        closeHelp,
      }}
    >
      {children}
      {target && (
        <ContextualHelpDrawer
          target={target}
          onNavigateSlug={(slug) => setTarget({ kind: "slug", value: slug })}
          onClose={closeHelp}
        />
      )}
    </HelpContext.Provider>
  );
};
