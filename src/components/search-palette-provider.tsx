// Global search-palette context: lifts open state and binds ⌘K from anywhere.
"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { SearchPalette } from "./search-palette";

interface Ctx {
  open: boolean;
  openPalette: (initialQuery?: string) => void;
  closePalette: () => void;
}

const SearchPaletteContext = createContext<Ctx | null>(null);

export function SearchPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");

  const openPalette = useCallback((q = "") => {
    setInitialQuery(q);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SearchPaletteContext.Provider value={{ open, openPalette, closePalette }}>
      {children}
      <SearchPalette
        open={open}
        initialQuery={initialQuery}
        onOpenChange={setOpen}
      />
    </SearchPaletteContext.Provider>
  );
}

export function useSearchPalette(): Ctx {
  const ctx = useContext(SearchPaletteContext);
  if (!ctx) throw new Error("useSearchPalette outside provider");
  return ctx;
}
