import { useDebounce } from "@uidotdev/usehooks";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import {
  Check,
  Link,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
  AlertCircle,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { NexusService } from "../dashboard/nexusService";
import { Note } from "../dashboard/types";

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
    "saved" | "saving" | "typing" | "syncing" | "error"
  >("saved");

  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);

  const lastKnownSyncedData = useRef({
    title: note.title,
    content: note.content,
  });

  const localStateRef = useRef({ title, content });
  useEffect(() => {
    localStateRef.current = { title, content };
  }, [title, content]);

  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  // 1. INCOMING SYNC LOGIC
  useEffect(() => {
    if (isPending) {
      return;
    }

    if (note.lastEditorId === sessionId) {
      return;
    }

    const currentLocal = localStateRef.current;
    const isTitleSynced = note.title === currentLocal.title;
    const isContentSynced = note.content === currentLocal.content;

    if (!isTitleSynced || !isContentSynced) {
      setTitle(note.title);
      setContent(note.content);
      lastKnownSyncedData.current = {
        title: note.title,
        content: note.content,
      };
      setStatus("syncing");

      const timer = setTimeout(() => {
        setStatus((prev) => (prev === "syncing" ? "saved" : prev));
      }, 500);

      return () => clearTimeout(timer);
    } else {
    }
  }, [note, isPending, sessionId]);

  // 2. INPUT HANDLING
  const handleTitleChange = (val: string) => {
    setTitle(val);
    setStatus("typing");
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setStatus("typing");
  };

  // NATIV TAB-HÅNDTERING: Gør at vi kan skrive tabs præcis ved cursoren i en normal textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      // Indsæt en rigtig Tabulator-char
      const newContent =
        content.substring(0, start) + "\t" + content.substring(end);
      setContent(newContent);
      setStatus("typing");

      // Flyt cursoren ét hak frem (efter tabulatoren)
      window.requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
      });
    }
  };

  // 2.5 FIX: "Stuck in typing" pga. undo/backspace
  useEffect(() => {
    if (status === "typing") {
      const lastSync = lastKnownSyncedData.current;
      if (title === lastSync.title && content === lastSync.content) {
        setStatus("saved");
      }
    }
  }, [title, content, status]);

  // 3. OUTGOING SAVE
  useEffect(() => {
    const lastSync = lastKnownSyncedData.current;
    const hasChanges =
      debouncedTitle !== lastSync.title ||
      debouncedContent !== lastSync.content;

    if (hasChanges) {
      setStatus("saving");

      const payloadTitle = debouncedTitle || "Uden titel";
      const payloadContent = debouncedContent;

      // Vi sender kun ændringen til parent-komponenten når vi VED vi er stoppet med at skrive
      onLocalUpdate(note.id, { title: payloadTitle, content: payloadContent });

      NexusService.saveNote(workspaceId, {
        ...noteRef.current,
        title: payloadTitle,
        content: payloadContent,
        updatedAt: Date.now(),
        lastEditorId: sessionId,
      })
        .then(() => {
          lastKnownSyncedData.current = {
            title: payloadTitle,
            content: payloadContent,
          };

          setStatus((prev) => {
            if (prev === "saving") return "saved";
            return prev;
          });
        })
        .catch((err) => {
          console.error("Save note failed:", err);
          setStatus("error");
        });
    }
  }, [debouncedTitle, debouncedContent, workspaceId, sessionId]);

  // 4. UNMOUNT SAVE
  useEffect(() => {
    return () => {
      const { title: curT, content: curC } = localStateRef.current;
      const lastSync = lastKnownSyncedData.current;

      const hasUnsavedChanges =
        curT !== lastSync.title || curC !== lastSync.content;

      if (hasUnsavedChanges) {
        NexusService.saveNote(workspaceId, {
          ...noteRef.current,
          title: curT || "Uden titel",
          content: curC,
          updatedAt: Date.now(),
          lastEditorId: sessionId,
        });
      }
    };
  }, [workspaceId, sessionId]);

  return (
    <div className="animate-in fade-in relative flex flex-1 flex-col overflow-hidden bg-surface duration-200">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-4">
        {/* STATUS */}
        <div
          className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase transition-colors ${
            status === "saved"
              ? "text-success"
              : status === "syncing"
                ? "text-warning"
                : status === "error"
                  ? "text-danger"
                  : "text-action"
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
              <div className="h-2 w-2 animate-pulse rounded-full bg-action" />
              <span>Skriver...</span>
            </>
          ) : status === "error" ? (
            <>
              <AlertCircle size={14} />
              <span>Fejl</span>
            </>
          ) : (
            <>
              <Check size={14} />
              <span>Gemt</span>
            </>
          )}
        </div>

        <div className="mx-2 h-4 w-px bg-strong" />

        <button
          onClick={onCopyLink}
          className="flex cursor-pointer items-center gap-1 text-low hover:text-action"
        >
          {linkCopyStatus ? (
            <span className="text-xs text-success">Kopieret</span>
          ) : (
            <Link size={18} />
          )}
        </button>
        <button
          onClick={onClose}
          className="cursor-pointer text-low hover:text-medium"
        >
          <X size={24} />
        </button>
      </div>

      {/* Header Input */}
      <input
        type="text"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Overskrift..."
        className="mt-6 mb-4 w-full shrink-0 bg-transparent px-6 text-3xl font-bold text-high placeholder-low outline-none"
      />

      {/* NATIVE TEXTAREA FIX: 
          Vi lader containeren være en ren flex-wrapper uden overflow. 
          Al scroll håndteres nu internt i vores textarea, som fylder hele højden. 
      */}
      <div className="flex w-full flex-1 flex-col overflow-hidden px-6 pb-6">
        <textarea
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Skriv din note her..."
          className="custom-scrollbar w-full flex-1 resize-none overflow-y-auto bg-transparent text-medium outline-none"
          style={{
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 16,
            lineHeight: 1.6,
            tabSize: 4, // Sørger for at indrykninger ser ud af noget
          }}
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

  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [isSnapshotPending, setIsSnapshotPending] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [linkCopyStatus, setLinkCopyStatus] = useState(false);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
  }, []);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    if (
      e.target === dialogRef.current &&
      mouseDownTarget.current === dialogRef.current
    ) {
      onClose();
    }
    mouseDownTarget.current = null;
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
    if (activeNoteId) {
      localStorage.setItem(`lastActiveNote_${workspaceId}`, activeNoteId);
    }
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
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto flex h-[80vh] w-[80vw] overflow-hidden rounded-xl border border-subtle bg-surface p-0 text-medium shadow-2xl backdrop:bg-background/80 backdrop:backdrop-blur-sm focus:outline-none"
    >
      <div className="flex h-full w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-64 flex-col border-r border-subtle bg-surface-elevated">
          <div className="flex items-center justify-between border-b border-subtle p-4">
            <span className="truncate pr-2 font-semibold text-high">
              {workspaceName}
            </span>
            <button
              onClick={handleCreateNote}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-action text-inverted hover:bg-action-hover"
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
                    ? "bg-action/20 ring-1 ring-action"
                    : "hover:bg-surface-hover"
                }`}
              >
                <div className="truncate pr-6 text-sm font-medium text-high">
                  {note.title || "Uden titel"}
                </div>
                <div className="mt-1 text-[10px] text-low">
                  {formatTimeAgo(note.updatedAt)}
                </div>
                <button
                  onClick={(e) => handleDeleteNote(e, note.id)}
                  className="absolute top-2 right-2 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-danger"
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
          <div className="flex flex-1 items-center justify-center bg-surface-sunken text-low">
            {notes.length === 0 ? "Opret en ny note..." : "Indlæser..."}
          </div>
        )}
      </div>
    </dialog>
  );
};
