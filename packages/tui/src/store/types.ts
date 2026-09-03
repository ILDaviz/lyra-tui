import type {
  TodoItem,
  TodoStatus,
  LinkItem,
  GitCommitInfo,
  GraphNode,
  VaultGraph,
} from "@lyratui/core";
import type {
  ViewMode,
  ActivePane,
  TuiNoteMetadata,
  TuiActiveNote,
} from "../types";
import type { Theme } from "../theme/types";

export type FolderModalType = "create" | "rename" | "delete" | null;

export interface FolderModalState {
  type: FolderModalType;
  targetFolder?: string;
}

export type NoteModalType = "delete" | "move" | null;

export interface NoteModalState {
  type: NoteModalType;
  targetFolder?: string;
  targetFilename?: string;
  targetTitle?: string;
}

export type BootStepId =
  "folders" | "notes" | "myday" | "todos" | "links" | "graph";

export type BootStepStatus = "pending" | "running" | "done";

export type BootSteps = Record<BootStepId, BootStepStatus>;

export interface NavigationSlice {
  viewMode: ViewMode;
  activePane: ActivePane;
  isEditing: boolean;
  setViewMode: (mode: ViewMode) => void;
  setActivePane: (pane: ActivePane) => void;
  setIsEditing: (editing: boolean) => void;
  cyclePane: () => void;
}

export interface UiSlice {
  themeId: string;
  activeTheme: Theme;
  themeVersion: number;
  statusMessage: string;
  isIndexSyncing: boolean;
  repoPath: string;
  isCommandPaletteOpen: boolean;
  isHelpOpen: boolean;
  folderModal: FolderModalState;
  noteModal: NoteModalState;
  linkModalOpen: boolean;
  isNoteHistoryOpen: boolean;
  isLocalGraphOpen: boolean;
  isWikilinkPickerOpen: boolean;
  isAiModalOpen: boolean;
  isAttachFileModalOpen: boolean;
  isAttachmentsListOpen: boolean;
  copyPopup: { visible: boolean; message: string };
  isBooting: boolean;
  bootSteps: BootSteps;

  setTheme: (themeId: string, customTheme?: Theme) => void;
  setStatusMessage: (msg: string) => void;
  setIndexSyncing: (syncing: boolean) => void;
  setBootStep: (step: BootStepId, status: BootStepStatus) => void;
  finishBoot: () => void;
  setRepoPath: (path: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setLinkModalOpen: (open: boolean) => void;
  setNoteHistoryOpen: (open: boolean) => void;
  setLocalGraphOpen: (open: boolean) => void;
  setWikilinkPickerOpen: (open: boolean) => void;
  setAiModalOpen: (open: boolean) => void;
  setAttachFileModalOpen: (open: boolean) => void;
  setAttachmentsListOpen: (open: boolean) => void;
  openFolderModal: (type: FolderModalType, targetFolder?: string) => void;
  closeFolderModal: () => void;
  openNoteModal: (
    type: NoteModalType,
    noteInfo?: { folderName: string; filename: string; title: string },
  ) => void;
  closeNoteModal: () => void;
  showCopyPopup: (msg?: string) => void;
  copyToClipboard: (
    text: string,
    customMessage?: string,
    showPopup?: boolean,
  ) => Promise<boolean>;
}

export interface FoldersNotesSlice {
  folders: string[];
  activeFolder: string;
  notes: TuiNoteMetadata[];
  selectedNoteIndex: number;
  activeNote: TuiActiveNote | null;
  notesRequestId: number;

  loadFoldersList: () => Promise<void>;
  selectFolder: (folder: string) => Promise<void>;
  loadNotesForFolder: (folder: string) => Promise<void>;
  setSelectedNoteIndex: (index: number | ((prev: number) => number)) => void;
  openNote: (note: TuiNoteMetadata, folderName?: string) => Promise<void>;
  saveNoteContent: (content: string) => Promise<void>;
  markNoteDirty: () => void;
  createNewNote: (title?: string) => Promise<void>;
  deleteCurrentNote: () => Promise<void>;
  deleteNoteAction: (folderName: string, filename: string) => Promise<boolean>;
  moveNoteAction: (
    folderName: string,
    filename: string,
    targetFolderName: string,
  ) => Promise<boolean>;
  createFolderAction: (name: string) => Promise<boolean>;
  renameFolderAction: (oldName: string, newName: string) => Promise<boolean>;
  deleteFolderAction: (folderName: string) => Promise<boolean>;
  getNoteHistoryAction: (
    folderName: string,
    filename: string,
  ) => Promise<GitCommitInfo[]>;
  getNoteContentAtCommitAction: (
    folderName: string,
    filename: string,
    commitHash: string,
  ) => Promise<string>;
  restoreNoteVersionAction: (
    folderName: string,
    filename: string,
    commitHash: string,
  ) => Promise<boolean>;
  isGitActiveAction: () => Promise<boolean>;
  openInExternalEditor: (
    renderer?: any,
    noteInfo?: { folderName?: string; filename?: string },
  ) => Promise<boolean>;
}

export interface TodosLinksMyDaySlice {
  myDayNotes: Array<{
    dateStr: string;
    filename: string;
    updatedAt: number;
    hasContent: boolean;
  }>;
  activeMyDayDate: string;
  todos: TodoItem[];
  selectedTodoIndex: number;
  links: LinkItem[];
  selectedLinkIndex: number;

  openMyDayDate: (dateStr: string) => Promise<void>;
  saveMyDayContent: (content: string) => Promise<void>;
  listMyDayNotesAction: () => Promise<void>;

  refreshTodos: () => Promise<void>;
  rescanFileDerived: (folderName: string, filename: string) => Promise<void>;
  setSelectedTodoIndex: (index: number | ((prev: number) => number)) => void;
  toggleTodoItem: (index: number) => Promise<void>;
  cycleTodoItem: (index: number) => Promise<void>;
  setTodoItemStatus: (index: number, status: TodoStatus) => Promise<void>;
  setTodoItemPriority: (index: number, priority: string) => Promise<void>;
  openTodoSource: (item: TodoItem) => Promise<void>;

  refreshLinks: () => Promise<void>;
  setSelectedLinkIndex: (index: number | ((prev: number) => number)) => void;
  openLinkSource: (item: LinkItem) => Promise<void>;
  addLinkAction: (input: {
    url: string;
    title: string;
    description?: string;
    tags?: string[];
  }) => Promise<boolean>;
  deleteLinkAction: (id: string) => Promise<boolean>;
  openSourceLocation: (
    folderName: string,
    filename: string,
    title?: string,
  ) => Promise<void>;
}

export type GraphFilter = "all" | "notes" | "unresolved";

export interface GraphSlice {
  graphData: VaultGraph | null;
  selectedGraphNodeId: string | null;
  graphFilter: GraphFilter;
  isGraphLoading: boolean;

  refreshGraph: () => Promise<void>;
  setSelectedGraphNodeId: (id: string | null) => void;
  setGraphFilter: (filter: GraphFilter) => void;
  openGraphNode: (node: GraphNode) => Promise<void>;
}

export interface RootActions {
  refreshAll: () => Promise<void>;
  initializeApp: (renderer?: any) => Promise<void>;
  initializeAppFast: () => Promise<void>;
}

export type AppStoreState = NavigationSlice &
  UiSlice &
  FoldersNotesSlice &
  TodosLinksMyDaySlice &
  GraphSlice &
  RootActions;
