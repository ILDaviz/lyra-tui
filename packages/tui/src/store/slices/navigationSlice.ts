import type { StateCreator } from "zustand";
import type { AppStoreState, NavigationSlice } from "../types";
import type { ViewMode, ActivePane } from "../../types";

export const createNavigationSlice: StateCreator<
  AppStoreState,
  [],
  [],
  NavigationSlice
> = (set, get) => ({
  viewMode: "myday",
  activePane: "sidebar",
  isEditing: false,

  setViewMode: (viewMode: ViewMode) => {
    set({ viewMode });
  },

  setActivePane: (activePane: ActivePane) => {
    set({ activePane });
  },

  setIsEditing: (isEditing: boolean) => {
    set({ isEditing });
  },

  cyclePane: () => {
    const { isEditing, viewMode, activePane } = get();
    if (isEditing) return;

    if (viewMode === "todos" || viewMode === "links") {
      set({ activePane: activePane === "sidebar" ? "list" : "sidebar" });
    } else {
      if (activePane === "sidebar") set({ activePane: "list" });
      else if (activePane === "list") set({ activePane: "editor" });
      else set({ activePane: "sidebar" });
    }
  },
});
