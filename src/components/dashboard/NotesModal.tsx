import { useDebounce } from "@uidotdev/usehooks";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { Check, Link, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import { NexusService } from "../../services/nexusService";
import { Note } from "../../types";

const formatTimeAgo = (timestamp: number) => {
  try {
    return formatDistanceToNow(timestamp, { addSuffix: true, locale: da });
  } catch (e) {
    return new Date(timestamp).toLocaleTimeString();
  }
};

// --- SUB-COMPONENT: NOTE EDITOR ---
interface NoteEditorProps {
  note: Note;
  workspaceId: string;
  onClose: () => void;
  onLocalUpdate: (id: string, updates: Partial<Note>) => void;
  onCopyLink: () => void;
  linkCopyStatus: boolean;
  isPending: boolean;
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  workspaceId,
  onClose,
  onLocalUpdate,
  onCopyLink,
  linkCopyStatus,
  isPending,
}) => {
  const sessionId = useRef(
    `sess_${Math.random().toString(36).substr(2, 5)}`,
  ).current;

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [status, setStatus] = useState<
    "saved" | "saving" | "typing" | "syncing"
  >("saved");

  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);

  const lastKnownSyncedData = useRef({
    title: note.title,
    content: note.content,
  });

  // 1. INCOMING SYNC LOGIC
  useEffect(() => {
    if (isPending) return;

    const isTitleSynced = note.title === title;
    const isContentSynced = note.content === content;

    if (isTitleSynced && isContentSynced) {
      if (status === "saving") {
        setStatus("saved");
        lastKnownSyncedData.current = {
          title: note.title,
          content: note.content,
        };
      }
      return;
    }

    console.log(`[EDITOR] 📥 Remote Update`);
    setTitle(note.title);
    setContent(note.content);
    lastKnownSyncedData.current = { title: note.title, content: note.content };
    setStatus("syncing");

    const timer = setTimeout(() => {
      setStatus((prev) => (prev === "syncing" ? "saved" : prev));
    }, 500);

    return () => clearTimeout(timer);
  }, [note, isPending]);

  // 2. INPUT HANDLING
  const handleTitleChange = (val: string) => {
    setTitle(val);
    setStatus("typing");
    onLocalUpdate(note.id, { title: val, content });
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    setStatus("typing");
    onLocalUpdate(note.id, { title, content: val });
  };

  // 3. OUTGOING SAVE
  useEffect(() => {
    const hasChanges =
      debouncedTitle !== lastKnownSyncedData.current.title ||
      debouncedContent !== lastKnownSyncedData.current.content;

    if (hasChanges) {
      setStatus("saving");
      lastKnownSyncedData.current = {
        title: debouncedTitle,
        content: debouncedContent,
      };

      NexusService.saveNote(workspaceId, {
        ...note,
        title: debouncedTitle || "Uden titel",
        content: debouncedContent,
        updatedAt: Date.now(),
        lastEditorId: sessionId,
      }).catch(() => {
        setStatus("saved");
      });
    }
  }, [debouncedTitle, debouncedContent]);

  // 4. UNMOUNT SAVE
  const stateRef = useRef({ title, content });
  useEffect(() => {
    stateRef.current = { title, content };
  }, [title, content]);

  useEffect(() => {
    return () => {
      const { title: curT, content: curC } = stateRef.current;
      const lastSync = lastKnownSyncedData.current;

      if (curT !== lastSync.title || curC !== lastSync.content) {
        NexusService.saveNote(workspaceId, {
          ...note,
          title: curT || "Uden titel",
          content: curC,
          updatedAt: Date.now(),
          lastEditorId: sessionId,
        });
      }
    };
  }, []);

  return (
    <div className="animate-in fade-in relative flex flex-1 flex-col bg-slate-800 p-6 duration-200">
      <div className="absolute top-4 right-4 flex items-center gap-4">
        {/* STATUS */}
        <div
          className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase transition-colors ${
            status === "saved"
              ? "text-green-400"
              : status === "syncing"
                ? "text-amber-400"
                : "text-blue-400"
          }`}
        >
          {status === "syncing" ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              <span>Modtager...</span>
            </>
          ) : status === "saving" ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Gemmer...</span>
            </>
          ) : status === "typing" ? (
            <>
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
              <span>Skriver...</span>
            </>
          ) : (
            <>
              <Check size={14} />
              <span>Gemt</span>
            </>
          )}
        </div>

        <div className="mx-2 h-4 w-px bg-slate-600" />

        <button
          onClick={onCopyLink}
          className="flex cursor-pointer items-center gap-1 text-slate-400 hover:text-blue-400"
        >
          {linkCopyStatus ? (
            <span className="text-xs text-green-400">Kopieret</span>
          ) : (
            <Link size={18} />
          )}
        </button>
        <button
          onClick={onClose}
          className="cursor-pointer text-slate-500 hover:text-slate-300"
        >
          <X size={24} />
        </button>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Overskrift..."
        className="mt-6 mb-4 w-full bg-transparent text-3xl font-bold text-slate-100 placeholder-slate-600 outline-none"
      />

      {/* REACT SIMPLE CODE EDITOR */}
      <div className="relative flex-1 overflow-hidden">
        <Editor
          autoFocus
          value={content}
          onValueChange={handleContentChange}
          highlight={(code) => code}
          padding={0}
          // VIGTIGE ÆNDRINGER HER:
          insertSpaces={false} // Brug ægte TAB karakter (\t) i stedet for mellemrum
          tabSize={1} // Indsæt 1 tab-tegn per tryk
          ignoreTabKey={false} // Lad brugeren bruge Tab-tasten
          className="h-full w-full text-base leading-relaxed text-slate-300"
          style={{
            fontFamily: "inherit",
            fontSize: "1rem",
            backgroundColor: "transparent",
            minHeight: "100%",
            tabSize: 8, // CSS: Her gør vi tabben BRED visuelt (8 mellemrums bredde)
          }}
          textareaClassName="focus:outline-none"
        />
      </div>
    </div>
  );
};

// --- MAIN MODAL (Uændret) ---
interface NotesModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

export const NotesModal: React.FC<NotesModalProps> = ({
  workspaceId,
  workspaceName,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isSnapshotPending, setIsSnapshotPending] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [linkCopyStatus, setLinkCopyStatus] = useState(false);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) onClose();
  };

  useEffect(() => {
    const unsubscribe = NexusService.subscribeToNotes(
      workspaceId,
      (updatedNotes, fromLocal) => {
        setNotes(updatedNotes);
        setIsSnapshotPending(fromLocal);

        if (isFirstLoad.current) {
          isFirstLoad.current = false;
          if (updatedNotes.length === 0) {
            handleCreateNote();
          } else {
            const lastId = localStorage.getItem(
              `lastActiveNote_${workspaceId}`,
            );
            const exists = updatedNotes.find((n) => n.id === lastId);
            setActiveNoteId(exists ? exists.id : updatedNotes[0].id);
          }
        } else {
          if (
            activeNoteId &&
            !updatedNotes.find((n) => n.id === activeNoteId)
          ) {
            setActiveNoteId(
              updatedNotes.length > 0 ? updatedNotes[0].id : null,
            );
          }
        }
      },
    );
    return () => unsubscribe();
  }, [workspaceId]);

  useEffect(() => {
    if (activeNoteId)
      localStorage.setItem(`lastActiveNote_${workspaceId}`, activeNoteId);
  }, [activeNoteId, workspaceId]);

  const handleLocalUpdate = (id: string, updates: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    );
  };

  const handleCreateNote = async () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: "Ny note",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastEditorId: "",
    };
    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    await NexusService.saveNote(workspaceId, newNote);
  };

  const handleDeleteNote = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (confirm("Slet note?")) {
      if (activeNoteId === noteId) {
        const remaining = notes.filter((n) => n.id !== noteId);
        setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await NexusService.deleteNote(workspaceId, noteId);
    }
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("noteSpace", workspaceId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setLinkCopyStatus(true);
      setTimeout(() => setLinkCopyStatus(false), 2000);
    });
  };

  const activeNote = notes.find((n) => n.id === activeNoteId);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={handleBackdropClick}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto flex h-[80vh] w-[80vw] overflow-hidden rounded-xl border border-slate-500 bg-slate-700 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm focus:outline-none"
    >
      <div className="flex h-full w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-64 flex-col border-r border-slate-600 bg-slate-800/50">
          <div className="flex items-center justify-between border-b border-slate-600 p-4">
            <span className="truncate pr-2 font-semibold text-slate-200">
              {workspaceName}
            </span>
            <button
              onClick={handleCreateNote}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => setActiveNoteId(note.id)}
                className={`group relative mb-1 flex cursor-pointer flex-col rounded-lg p-3 transition-colors ${
                  activeNoteId === note.id
                    ? "bg-blue-600/20 ring-1 ring-blue-500"
                    : "hover:bg-slate-700/50"
                }`}
              >
                <div className="truncate pr-6 text-sm font-medium text-slate-200">
                  {note.title || "Uden titel"}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {formatTimeAgo(note.updatedAt)}
                </div>
                <button
                  onClick={(e) => handleDeleteNote(e, note.id)}
                  className="absolute top-2 right-2 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            isPending={isSnapshotPending}
            workspaceId={workspaceId}
            onClose={onClose}
            onLocalUpdate={handleLocalUpdate}
            onCopyLink={handleCopyLink}
            linkCopyStatus={linkCopyStatus}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-slate-800 text-slate-500">
            {notes.length === 0 ? "Opret en ny note..." : "Indlæser..."}
          </div>
        )}
      </div>
    </dialog>
  );
};
