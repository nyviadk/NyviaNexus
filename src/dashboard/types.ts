import { Timestamp } from "firebase/firestore";
import { AiData } from "@/background/main";
import { Profile, TabData, UserCategory } from "../types";

// Intersection type for Tabs that exist in runtime (have physical ID/WindowID)
export type RuntimeTabData = TabData & {
  id?: number;
  windowId?: number;
  sourceWorkspaceId?: string;
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
