/**
 * 主题状态管理
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "default" | "illustration";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "default",
      setMode: (mode) => set({ mode }),
      toggleMode: () => {
        const current = get().mode;
        set({ mode: current === "default" ? "illustration" : "default" });
      },
    }),
    {
      name: "theme-storage",
    }
  )
);
