import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { FilePlus2, FolderOpen, Save } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import { Button, Dialog, Input } from '@nexos/ui';

import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

export default function TextEditorApp({ window }: ApplicationProperties) {
  const desktop = useDesktop();
  const [path, setPath] = useState<string | null>(window.payload['path'] ?? null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [targetPath, setTargetPath] = useState('/home/Documents/Untitled.txt');
  const [openDialog, setOpenDialog] = useState(false);
  const [openPath, setOpenPath] = useState('/home/Documents/');

  const load = useCallback(async (nextPath: string) => {
    setContent(await nexos.files.readFile(nextPath));
    setPath(nextPath);
    setTargetPath(nextPath);
    setDirty(false);
  }, []);

  useEffect(() => {
    const requested = window.payload['path'];
    if (requested) void load(requested);
  }, [load, window.payload]);

  const save = useCallback(
    async (override?: string) => {
      const destination = override ?? path;
      if (!destination) {
        setSaveAsOpen(true);
        return;
      }
      setSaving(true);
      try {
        await nexos.files.writeFile(destination, content, { create: true, overwrite: true });
        setPath(destination);
        setTargetPath(destination);
        setDirty(false);
        await desktop.notify('File saved', destination, 'com.nexos.text-editor');
      } finally {
        setSaving(false);
      }
    },
    [content, desktop, path],
  );

  useEffect(() => {
    if (!dirty || !path) return;
    const timer = globalThis.window.setTimeout(() => void save(), 1_000);
    return () => globalThis.window.clearTimeout(timer);
  }, [dirty, path, save]);

  const keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (event.shiftKey) setSaveAsOpen(true);
      else void save();
    }
  };

  return (
    <div className="text-editor-app" onKeyDown={keyDown}>
      <header className="editor-toolbar">
        <Button
          variant="ghost"
          onClick={() => {
            setPath(null);
            setContent('');
            setDirty(false);
          }}
        >
          <FilePlus2 size={15} /> New
        </Button>
        <Button variant="ghost" onClick={() => setOpenDialog(true)}>
          <FolderOpen size={15} /> Open
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => void save()}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={() => setSaveAsOpen(true)}>
          Save as
        </Button>
        <span>{path ?? 'Untitled'}</span>
      </header>
      <div className="editor-ruler">
        <span>TEXT</span>
        <span>UTF-8</span>
        <span>{content.split('\n').length} lines</span>
      </div>
      <textarea
        autoFocus
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setDirty(true);
        }}
        aria-label="Text editor"
        spellCheck={false}
        placeholder="Start typing…"
      />
      <footer>
        <span>{dirty ? 'Modified' : 'Saved'}</span>
        <span>{content.length} characters</span>
        <span>Ctrl+S to save</span>
      </footer>
      <Dialog
        open={saveAsOpen}
        title="Save file as"
        onClose={() => setSaveAsOpen(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save(targetPath).then(() => setSaveAsOpen(false))}>
              Save
            </Button>
          </>
        }
      >
        <label className="dialog-field">
          <span>NexOS path</span>
          <Input
            autoFocus
            value={targetPath}
            onChange={(event) => setTargetPath(event.target.value)}
          />
        </label>
      </Dialog>
      <Dialog
        open={openDialog}
        title="Open file"
        onClose={() => setOpenDialog(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void load(openPath).then(() => setOpenDialog(false))}>
              Open
            </Button>
          </>
        }
      >
        <label className="dialog-field">
          <span>NexOS path</span>
          <Input autoFocus value={openPath} onChange={(event) => setOpenPath(event.target.value)} />
        </label>
      </Dialog>
    </div>
  );
}
