import { NoteMetadata, ActiveNote } from "@lyratui/core";

export type ViewMode = "notes" | "myday" | "todos" | "links";
export type ActivePane = "sidebar" | "list" | "editor" | "command" | "modal";

export type TuiNoteMetadata = NoteMetadata;
export type TuiActiveNote = ActiveNote;
