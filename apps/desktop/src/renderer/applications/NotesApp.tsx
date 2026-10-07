import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FilePlus2, NotebookPen, Search, Trash2 } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { FileNode } from '@nexos/types';
import { Button, EmptyState, IconButton, Input } from '@nexos/ui';

import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

interface NoteDocument {
  title: string;
  body: string;
}

function parseNote(content: string, fallbackTitle: string): NoteDocument {
  try {
    const value = JSON.parse(content) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'title' in value &&
      'body' in value &&
      typeof value.title === 'string' &&
      typeof value.body === 'string'
    ) {
      return { title: value.title, body: value.body };
    }
  } catch {
    return { title: fallbackTitle, body: content };
  }
  return { title: fallbackTitle, body: content };
}

export default function NotesApp({ window }: ApplicationProperties) {
  const desktop = useDesktop();
  const [notes, setNotes] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const loadingNote = useRef(false);

  const refresh = useCallback(async () => {
    try {
      await nexos.files.stat('/home/Documents/Notes');
    } catch {
      await nexos.files.mkdir('/home/Documents/Notes');
    }
    const entries = await nexos.files.readdir('/home/Documents/Notes');
    setNotes(entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.note')));
  }, []);

  const openNote = useCallback(async (path: string) => {
    loadingNote.current = true;
    const content = await nexos.files.readFile(path);
    const fallback =
      path
        .split('/')
        .at(-1)
        ?.replace(/\.note$/, '') ?? 'Untitled';
    const note = parseNote(content, fallback);
    setSelectedPath(path);
    setTitle(note.title);
    setBody(note.body);
    setDirty(false);
    requestAnimationFrame(() => {
      loadingNote.current = false;
    });
  }, []);

  useEffect(() => {
    void refresh().then(async () => {
      const requested = window.payload['path'];
      if (requested?.endsWith('.note')) await openNote(requested);
    });
  }, [openNote, refresh, window.payload]);

  const save = useCallback(async () => {
    if (!selectedPath || !dirty) return;
    setSaving(true);
    try {
      await nexos.files.writeFile(selectedPath, JSON.stringify({ title, body }, null, 2), {
        create: false,
        overwrite: true,
        mimeType: 'application/x-nexos-note',
      });
      setDirty(false);
      setSavedAt(new Date());
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [body, dirty, refresh, selectedPath, title]);

  useEffect(() => {
    if (!dirty || loadingNote.current) return;
    const timer = globalThis.window.setTimeout(() => void save(), 700);
    return () => globalThis.window.clearTimeout(timer);
  }, [dirty, save]);

  const createNote = async () => {
    let number = notes.length + 1;
    let path = `/home/Documents/Notes/Untitled ${number}.note`;
    while (true) {
      try {
        await nexos.files.writeFile(
          path,
          JSON.stringify({ title: `Untitled ${number}`, body: '' }, null, 2),
          { create: true, overwrite: false, mimeType: 'application/x-nexos-note' },
        );
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== 'ALREADY_EXISTS') throw error;
        number += 1;
        path = `/home/Documents/Notes/Untitled ${number}.note`;
      }
    }
    await refresh();
    await openNote(path);
  };

  const removeNote = async () => {
    if (!selectedPath) return;
    await nexos.files.remove(selectedPath);
    setSelectedPath(null);
    setTitle('');
    setBody('');
    await refresh();
    await desktop.notify(
      'Note moved to recycle bin',
      'You can restore it from Files.',
      'com.nexos.notes',
    );
  };

  const markDirty = () => {
    if (!loadingNote.current) setDirty(true);
  };

  const keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  };

  const filtered = notes.filter((note) => note.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="notes-app" onKeyDown={keyDown}>
      <aside className="notes-list-pane">
        <header>
          <div>
            <NotebookPen size={19} />
            <strong>Notes</strong>
          </div>
          <IconButton label="New note" onClick={() => void createNote()}>
            <FilePlus2 size={17} />
          </IconButton>
        </header>
        <label className="notes-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
          />
        </label>
        <div className="note-list">
          {filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              className={selectedPath === note.path ? 'is-selected' : ''}
              onClick={() => void openNote(note.path)}
            >
              <strong>{note.name.replace(/\.note$/, '')}</strong>
              <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="note-editor">
        {!selectedPath ? (
          <EmptyState
            icon={<NotebookPen size={32} />}
            title="Choose a note"
            description="Select a note or create a new one to begin writing."
            action={
              <Button onClick={() => void createNote()}>
                <FilePlus2 size={16} /> New note
              </Button>
            }
          />
        ) : (
          <>
            <header>
              <Input
                className="note-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  markDirty();
                }}
                aria-label="Note title"
              />
              <div>
                <span>
                  {saving
                    ? 'Saving…'
                    : dirty
                      ? 'Unsaved'
                      : savedAt
                        ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Saved'}
                </span>
                <IconButton label="Delete note" onClick={() => void removeNote()}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </header>
            <textarea
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                markDirty();
              }}
              placeholder="Start writing…"
              aria-label="Note content"
              spellCheck
            />
            <footer>
              <span>{body.trim() ? body.trim().split(/\s+/).length : 0} words</span>
              <span>Autosave enabled</span>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
