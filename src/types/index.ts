import { Timestamp } from "firebase/firestore";
import { AiData } from "@/background/main";

export type ItemType = "folder" | "workspace";

export interface NexusItem {
  id: string;
  profileId: string;
  parentId: string | "root";
  type: ItemType;
  name: string;
  isSnapshot?: boolean;
}

export interface Profile {
  id: string;
  name: string;
}

export interface TabData {
  uid: string;
  title: string;
  url: string;
  favIconUrl: string;
  isIncognito?: boolean;
  aiData?: AiData;
}

export interface WorkspaceWindow {
  id: string;
  tabs: TabData[];
  isActive?: boolean;
  lastActive?: Timestamp;
  createdAt: Timestamp;
  name?: string; // Kan være nyttig til debugging eller UI
}

// NYE TYPES TIL INDSTILLINGER
export interface UserCategory {
  id: string;
  name: string;
  color: string; // Hex code
}

export interface AiSettings {
  allowDynamic: boolean; // Må AI opfinde nye kategorier?
  useUncategorized: boolean; // Skal vi bruge "Ukategoriseret" hvis intet passer (kun hvis allowDynamic = false)
  userCategories: UserCategory[];
}

// --- NY TYPE TIL ARKIV FUNKTIONEN ---
export interface ArchiveItem {
  id: string;
  url: string;
  title?: string;
  createdAt: number;
}
