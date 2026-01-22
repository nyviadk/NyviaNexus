import { useDebounce } from "@uidotdev/usehooks";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { NexusService } from "../../services/nexusService";
import { Note } from "../../types";

// --- HELPERS ---
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
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  workspaceId,
  onClose,
}) => {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saveStatus, setSaveStatus] = useState<"Gemt" | "Gemmer...">("Gemt");

  const titleRef = useRef(title);
  const contentRef = useRef(content);

  useEffect(() => {
    titleRef.current = title;
    contentRef.current = content;
  }, [title, content]);

  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);

  // 1. UI Feedback
  useEffect(() => {
    if (title !== debouncedTitle || content !== debouncedContent) {
      setSaveStatus("Gemmer...");
    }
  }, [title, content, debouncedTitle, debouncedContent]);

  // 2. Debounce Save
  useEffect(() => {
    if (title === debouncedTitle && content === debouncedContent) {
      if (saveStatus === "Gemmer...") setSaveStatus("Gemt");
      return;
    }
    saveToFirestore(debouncedTitle, debouncedContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, debouncedContent]);

  // 3. Unmount Save
  useEffect(() => {
    return () => {
      const currentTitle = titleRef.current;
      const currentContent = contentRef.current;

      if (currentTitle !== note.title || currentContent !== note.content) {
        NexusService.saveNote(workspaceId, {
          ...note,
          title: currentTitle || "Uden titel",
          content: currentContent,
          updatedAt: Date.now(),
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToFirestore = async (t: string, c: string) => {
    await NexusService.saveNote(workspaceId, {
      ...note,
      title: t || "Uden titel",
      content: c,
      updatedAt: Date.now(),
    });
    setSaveStatus("Gemt");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const indent = "  ";
      const newContent =
        content.substring(0, start) + indent + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + indent.length;
      }, 0);
    }
  };

  return (
    <div className="animate-in fade-in relative flex flex-1 flex-col bg-slate-800 p-6 duration-200">
      {/* Header Area: Status + Close Button */}
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <div
          className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase transition-colors ${
            saveStatus === "Gemt" ? "text-green-400" : "text-blue-400"
          }`}
        >
          {saveStatus === "Gemmer..." ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Gemmer...</span>
            </>
          ) : (
            <>
              <Check size={14} />
              <span>Gemt</span>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          className="cursor-pointer text-slate-500 hover:text-slate-300"
        >
          <X size={24} />
        </button>
      </div>

      {/* Titel Input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Overskrift..."
        className="mt-6 mb-4 w-full bg-transparent text-3xl font-bold text-slate-100 placeholder-slate-600 outline-none"
      />

      {/* Editor Textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Skriv dine tanker her..."
        className="custom-scrollbar w-full flex-1 resize-none bg-transparent font-mono text-base leading-relaxed text-slate-300 placeholder-slate-700 outline-none"
        spellCheck={false}
        autoFocus
        onFocus={(e) => {
          // Sætter cursoren til starten (0,0) når feltet får fokus
          e.target.setSelectionRange(0, 0);
        }}
      />
    </div>
  );
};

// --- MAIN COMPONENT: NOTES MODAL ---
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
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  // Init
  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  // Load Noter
  useEffect(() => {
    const unsubscribe = NexusService.subscribeToNotes(
      workspaceId,
      (updatedNotes) => {
        setNotes(updatedNotes);

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

  // Persist active ID selection
  useEffect(() => {
    if (activeNoteId) {
      localStorage.setItem(`lastActiveNote_${workspaceId}`, activeNoteId);
    }
  }, [activeNoteId, workspaceId]);

  const handleCreateNote = async () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: "Ny note",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setActiveNoteId(newNote.id);
    await NexusService.saveNote(workspaceId, newNote);
  };

  const handleDeleteNote = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (confirm("Er du sikker på, at du vil slette denne note?")) {
      if (activeNoteId === noteId) {
        const remaining = notes.filter((n) => n.id !== noteId);
        setActiveNoteId(remaining.length > 0 ? remaining[0].id : null);
      }
      await NexusService.deleteNote(workspaceId, noteId);
      if (notes.length <= 1) handleCreateNote();
    }
  };

  const activeNote = notes.find((n) => n.id === activeNoteId);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="open:animate-in open:fade-in open:zoom-in-95 m-auto flex h-[80vh] w-[80vw] overflow-hidden rounded-xl border border-slate-500 bg-slate-700 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm focus:outline-none"
    >
      <div className="flex h-full w-full">
        {/* --- SIDEBAR --- */}
        <div className="flex w-64 flex-col border-r border-slate-600 bg-slate-800/50">
          <div className="flex items-center justify-between border-b border-slate-600 p-4">
            <span
              className="truncate pr-2 font-semibold text-slate-200"
              title={workspaceName}
            >
              {workspaceName}
            </span>

            <button
              onClick={handleCreateNote}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded bg-blue-600 text-white transition-colors hover:bg-blue-500"
              title="Ny Note"
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
                  className="absolute top-2 right-2 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                  title="Slet note"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* --- EDITOR --- */}
        {activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            workspaceId={workspaceId}
            onClose={onClose}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-slate-800 text-slate-500">
            Indlæser...
          </div>
        )}
      </div>
    </dialog>
  );
};
