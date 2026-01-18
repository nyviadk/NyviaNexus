import { Inbox as InboxIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NexusItem } from "../types";
import { ClaimModal } from "./ClaimModal";

interface Props {
  activeProfile: string;
  items: NexusItem[];
  onRefresh: () => void;
}

// Discriminated Union for messages i denne komponent
type InboxMessage =
  | { type: "ACTIVE_MAPPINGS_UPDATED"; payload?: unknown }
  | { type: "PHYSICAL_WINDOWS_CHANGED"; payload?: unknown }
  | { type: "UNKNOWN"; payload?: unknown };

// Typen for svaret fra GET_ACTIVE_MAPPINGS
// Vi har kun brug for ID'et (index 0), metadata (index 1) er ligegyldigt her
type MappingResponse = [number, unknown][];

export const Inbox = ({ activeProfile, items, onRefresh }: Props) => {
  const [unassignedWindows, setUnassignedWindows] = useState<
    chrome.windows.Window[]
  >([]);
  const [selectedWindowId, setSelectedWindowId] = useState<number | null>(null);

  // Denne funktion kører nu kun når den bliver bedt om det (Event driven)
  const checkUnsaved = useCallback(() => {
    chrome.runtime.sendMessage(
      { type: "GET_ACTIVE_MAPPINGS" },
      (response: MappingResponse) => {
        chrome.windows.getAll({ populate: true }, (windows) => {
          // response kan være undefined ved fejl/timeout, så vi defaulter til []
          const activeIds = new Set((response || []).map((r) => r[0]));

          // Filtrer vinduer der ikke er i mappings og som ikke er inkognito (gemmes manuelt)
          const unsaved = windows.filter(
            (w) =>
              w.id !== undefined && // Vigtigt: Chrome vinduer kan teoretisk mangle ID
              !activeIds.has(w.id) &&
              w.type === "normal" &&
              !w.incognito
          );
          setUnassignedWindows(unsaved);
        });
      }
    );
  }, []);

  useEffect(() => {
    // 1. Kør tjekket med det samme komponenten mounter
    checkUnsaved();

    // 2. Lyt på beskeder fra background scriptet
    const messageListener = (msg: InboxMessage) => {
      // Hvis mappings ændrer sig (f.eks. et vindue bliver claimed), tjek igen
      if (msg.type === "ACTIVE_MAPPINGS_UPDATED") {
        checkUnsaved();
      }
      // Hvis fysiske vinduer åbnes/lukkes, tjek igen
      if (msg.type === "PHYSICAL_WINDOWS_CHANGED") {
        checkUnsaved();
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup listener ved unmount
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [checkUnsaved]);

  if (unassignedWindows.length === 0) return null;

  return (
    <section className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
      <h2 className="text-xs font-bold uppercase text-orange-400 mb-3 flex items-center gap-2">
        <InboxIcon size={14} /> Inbox (Unsaved)
      </h2>
      <div className="space-y-2">
        {unassignedWindows.map((win) => (
          <div
            key={win.id}
            className="text-xs bg-slate-800 p-2 rounded flex justify-between items-center group"
          >
            <span className="truncate">
              Vindue {win.id} ({win.tabs?.length || 0} tabs)
            </span>
            <button
              onClick={() => win.id && setSelectedWindowId(win.id)}
              className="bg-orange-600/20 text-orange-400 px-2 py-1 rounded hover:bg-orange-600 hover:text-white transition cursor-pointer"
            >
              Claim
            </button>
          </div>
        ))}
      </div>
      {selectedWindowId && (
        <ClaimModal
          windowId={selectedWindowId}
          activeProfile={activeProfile}
          folders={items.filter((i) => i.type === "folder")}
          onClose={() => setSelectedWindowId(null)}
          onSuccess={onRefresh}
        />
      )}
    </section>
  );
};
