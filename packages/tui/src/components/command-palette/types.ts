export interface CommandItem {
  id: string;
  title: string;
  category: string;
  description?: string;
  action: () => void;
}

export interface SearchItem {
  id: string;
  title: string;
  category: string;
  description?: string;
  action: () => void;
}

export type PaletteTab = "commands" | "search";
export type SearchMode = "text" | "semantic" | "hybrid";
