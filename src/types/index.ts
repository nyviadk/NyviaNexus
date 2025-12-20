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
  title: string;
  url: string;
  favIconUrl?: string;
}

export interface WorkspaceWindow {
  id: string;
  tabs: TabData[];
  isActive?: boolean;
  lastActive?: any;
}
