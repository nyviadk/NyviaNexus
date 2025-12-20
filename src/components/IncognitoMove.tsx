import { useEffect, useState } from "react";
import { Send, ShieldAlert } from "lucide-react";

interface Props {
  activeItems: any[];
}

export const IncognitoMove = ({ activeItems }: Props) => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.incognito) {
        setCurrentTab(tabs[0]);
      }
    });
  }, []);

  const moveTab = (workspaceId: string, internalWindowId: string) => {
    if (!currentTab?.id) return;

    chrome.runtime.sendMessage(
      {
        type: "MOVE_INCOGNITO_TAB",
        payload: {
          tabId: currentTab.id,
          targetWorkspaceId: workspaceId,
          targetInternalWindowId: internalWindowId,
        },
      },
      () => window.close()
    );
  };

  if (!currentTab) return null;

  return (
    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase mb-2">
        <ShieldAlert size={14} /> Inkognito fane fundet
      </div>
      <div className="flex flex-wrap gap-2">
        {activeItems.map((item) => (
          <button
            key={item.internalWindowId}
            onClick={() => moveTab(item.workspaceId, item.internalWindowId)}
            className="bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white px-2 py-1 rounded text-[10px] transition"
          >
            <Send size={10} className="inline mr-1" /> {item.name}
          </button>
        ))}
      </div>
    </div>
  );
};
