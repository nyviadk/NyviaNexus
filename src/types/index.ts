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
  uid: string; // Gør uid obligatorisk fremadrettet
  title: string;
  url: string;
  favIconUrl?: string;
  isIncognito?: boolean;
  aiData?: AiData; // Ny felt til AI data
}

export interface WorkspaceWindow {
  id: string;
  tabs: TabData[];
  isActive?: boolean;
  lastActive?: any;
}
