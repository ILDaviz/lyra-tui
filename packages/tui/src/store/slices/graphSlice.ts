import { StateCreator } from "zustand";
import {
  getGraphService,
  GraphNode,
  VaultGraph,
  writeNote,
} from "@lyratui/core";
import type { AppStoreState, GraphSlice, GraphFilter } from "../types";
import { t, I18N_KEYS } from "../../i18n";

export const createGraphSlice: StateCreator<
  AppStoreState,
  [],
  [],
  GraphSlice
> = (set, get) => ({
  graphData: null,
  selectedGraphNodeId: null,
  graphFilter: "all",
  isGraphLoading: false,

  refreshGraph: async () => {
    try {
      set({ isGraphLoading: true });
      const graphService = getGraphService();
      const graph = await graphService.buildVaultGraph({ force: true });
      set((state) => {
        let selectedId = state.selectedGraphNodeId;
        if (!selectedId || !graph.nodes.some((n) => n.id === selectedId)) {
          selectedId = graph.nodes.length > 0 ? graph.nodes[0].id : null;
        }
        return {
          graphData: graph,
          selectedGraphNodeId: selectedId,
          isGraphLoading: false,
        };
      });
    } catch (err) {
      console.error("Failed to refresh graph data:", err);
      set({ isGraphLoading: false });
    }
  },

  setSelectedGraphNodeId: (id: string | null) => {
    set({ selectedGraphNodeId: id });
  },

  setGraphFilter: (filter: GraphFilter) => {
    set({ graphFilter: filter });
  },

  openGraphNode: async (node: GraphNode) => {
    if (node.exists) {
      if (node.folderName === "myday") {
        const dateStr = node.filename.replace(/\.md$/, "");
        await get().openMyDayDate(dateStr);
        get().setViewMode("myday");
        get().setActivePane("list");
      } else {
        await get().openSourceLocation(
          node.folderName || "/",
          node.filename,
          node.title,
        );
      }
    } else {
      const targetFolder = get().activeFolder || "/";
      const cleanTitle = node.title
        .replace(/^unresolved:/, "")
        .replace(/\.md$/, "");
      const safeFilename = `${cleanTitle}.md`;
      const initialContent = `# ${cleanTitle}\n\n`;

      try {
        const res = await writeNote({
          folderName: targetFolder,
          filename: safeFilename,
          content: initialContent,
        });

        if (res.success) {
          get().setStatusMessage(
            t(I18N_KEYS.STATUS_NOTE_SAVED_NAME, { filename: cleanTitle }),
          );
          await get().refreshAll();
          await get().refreshGraph();
          await get().openSourceLocation(
            targetFolder,
            safeFilename,
            cleanTitle,
          );
        }
      } catch (err: any) {
        console.error("Failed to create note from unresolved graph node:", err);
        get().setStatusMessage(
          t(I18N_KEYS.STATUS_ERROR_CREATING_NOTE, { error: err.message }),
        );
      }
    }
  },
});
