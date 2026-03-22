import { Timestamp } from "@/lib/firebase";
import { AiData, TabData } from "../background/main";

// Intersection type for Tabs that exist in runtime (have physical ID/WindowID)
export type RuntimeTabData = TabData & {
  id?: number;
  windowId?: number;
  sourceWorkspaceId?: string;
  lastUpdated: number;
};

// Type definition for Drag & Drop payload in SessionStorage
export interface DraggedTabPayload extends RuntimeTabData {
  sourceWorkspaceId: string;
}

export interface InboxData {
  id: string;
  tabs: TabData[];
  lastUpdate?: Timestamp; // Type-safe Timestamp
}

export interface CategoryMenuProps {
  tab: TabData;
  workspaceId: string | null;
  winId: string | null;
  position: { x: number; y: number };
  onClose: () => void;
  categories: UserCategory[];
}

export interface ReasoningModalProps {
  data: AiData;
  onClose: () => void;
}

export interface SettingsModalProps {
  profiles: Profile[];
  onClose: () => void;
  activeProfile: string;
  setActiveProfile: (id: string) => void;
}

export interface TabItemProps {
  tab: TabData;
  isSelected: boolean;
  onSelect: (tab: TabData) => void;
  onDelete: (tab: TabData) => void;
  sourceWorkspaceId?: string;
  onDragStart?: () => void;
  userCategories: UserCategory[];
  onShowReasoning: (data: AiData) => void;
  onOpenMenu: (e: React.MouseEvent, tab: TabData) => void;
}

// Discriminated Union for Messaging
export type DashboardMessage =
  | { type: "RESTORATION_STATUS_CHANGE"; payload: string | null }
  | { type: "PHYSICAL_WINDOWS_CHANGED"; payload?: never }
  | { type: "UNKNOWN"; payload?: unknown };

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
  order?: number;
}

export interface WorkspaceWindow {
  id: string;
  tabs: TabData[];
  isActive?: boolean;
  lastActive?: Timestamp;
  createdAt: Timestamp;
  name?: string; // Dette felt bruger vi til det brugerdefinerede navn
  isArchived?: boolean;
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
