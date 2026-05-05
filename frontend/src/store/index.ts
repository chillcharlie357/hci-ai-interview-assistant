/**
 * 全局状态管理 - 使用 Zustand
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PrepSession, InterviewSession } from "../interviewFlow";

interface AppState {
  prepSession: PrepSession | null;
  interviewSession: InterviewSession | null;
  sidebarCollapsed: boolean;
  setPrepSession: (session: PrepSession | null) => void;
  setInterviewSession: (session: InterviewSession | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  clearAll: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      prepSession: null,
      interviewSession: null,
      sidebarCollapsed: false,
      setPrepSession: (session) => set({ prepSession: session }),
      setInterviewSession: (session) => set({ interviewSession: session }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      clearAll: () => set({ prepSession: null, interviewSession: null }),
    }),
    {
      name: "ai-interview-storage",
      partialize: (state) => ({
        prepSession: state.prepSession,
        interviewSession: state.interviewSession,
      }),
    }
  )
);

export { useThemeStore, type ThemeMode } from "./themeStore";
