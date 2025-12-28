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

export interface AiData {
  status: "pending" | "completed" | "failed" | "processing";
  category?: string;
  confidence?: number;
  reasoning?: string;
  lastChecked?: number;
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
  lastActive?: any;
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
