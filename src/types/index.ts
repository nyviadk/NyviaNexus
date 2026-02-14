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
  order?: number;
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
  name?: string; // Dette felt bruger vi til det brugerdefinerede navn
}

export interface UserCategory {
  id: string;
  name: string;
  color: string;
}

export interface AiSettings {
  allowDynamic: boolean;
  useUncategorized: boolean;
  userCategories: UserCategory[];
}

export interface ArchiveItem {
  id: string;
  url: string;
  title?: string;
  createdAt: number;
  readLater?: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  lastEditorId?: string;
}
