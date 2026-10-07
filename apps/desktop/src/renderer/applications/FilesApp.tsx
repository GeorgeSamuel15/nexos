import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock3,
  Copy,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Heart,
  Home,
  Info,
  List,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { FileNode } from '@nexos/types';
import {
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Sidebar,
  Spinner,
} from '@nexos/ui';

import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

type ViewMode = 'grid' | 'list';
type SourceMode = 'directory' | 'recent' | 'favorites';

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function FileGlyph({ node }: { node: FileNode }) {
  if (node.kind === 'directory') return <Folder size={30} fill="currentColor" />;
  return <File size={29} />;
}

export default function FilesApp({ window }: ApplicationProperties) {
  const desktop = useDesktop();
  const [path, setPath] = useState(window.payload['path'] ?? '/home');
  const [mode, setMode] = useState<SourceMode>('directory');
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [selected, setSelected] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(['/home']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [dialog, setDialog] = useState<'folder' | 'file' | 'rename' | 'delete' | 'details' | null>(
    null,
  );
  const [name, setName] = useState('');
  const [clipboard, setClipboard] = useState<{ node: FileNode; mode: 'copy' | 'move' } | null>(
    null,
  );
  const [context, setContext] = useState<{ x: number; y: number; node: FileNode } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: FileNode[];
      if (query.trim()) result = await nexos.files.search(query);
      else if (mode === 'recent') result = await nexos.files.recent(50);
      else if (mode === 'favorites') result = await nexos.files.favorites();
      else result = await nexos.files.readdir(path, path === '/home/.Trash');
      setNodes(result);
      setSelected((current) => result.find((node) => node.id === current?.id) ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load this location.');
    } finally {
      setLoading(false);
    }
  }, [mode, path, query]);

  useEffect(() => {
    const timer = globalThis.window.setTimeout(() => void load(), query ? 120 : 0);
    return () => globalThis.window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    const target = window.payload['path'];
    if (target && target !== path) {
      setPath(target);
      setMode('directory');
    }
  }, [path, window.payload]);

  const navigate = (nextPath: string, record = true) => {
    setMode('directory');
    setQuery('');
    setPath(nextPath);
    setSelected(null);
    if (record) {
      const next = [...history.slice(0, historyIndex + 1), nextPath];
      setHistory(next);
      setHistoryIndex(next.length - 1);
    }
  };

  const open = async (node: FileNode) => {
    if (node.kind === 'directory') navigate(node.path);
    else await desktop.openFile(node.path);
  };

  const submitName = async () => {
    try {
      if (dialog === 'folder') await nexos.files.mkdir(joinPath(path, name));
      else if (dialog === 'file')
        await nexos.files.writeFile(joinPath(path, name), '', { create: true, overwrite: false });
      else if (dialog === 'rename' && selected) await nexos.files.rename(selected.path, name);
      setDialog(null);
      setName('');
      await load();
    } catch (reason) {
      await desktop.notify(
        'Files',
        reason instanceof Error ? reason.message : 'The operation failed.',
        'com.nexos.files',
      );
    }
  };

  const remove = async () => {
    if (!selected) return;
    await nexos.files.remove(selected.path, path === '/home/.Trash');
    setDialog(null);
    setSelected(null);
    await load();
  };

  const restore = async (node: FileNode) => {
    await nexos.files.restore(node.path);
    await load();
  };

  const paste = async () => {
    if (!clipboard || mode !== 'directory') return;
    let destination = joinPath(path, clipboard.node.name);
    if (destination === clipboard.node.path) {
      const dot = clipboard.node.kind === 'file' ? clipboard.node.name.lastIndexOf('.') : -1;
      const base = dot > 0 ? clipboard.node.name.slice(0, dot) : clipboard.node.name;
      const extension = dot > 0 ? clipboard.node.name.slice(dot) : '';
      destination = joinPath(path, `${base} copy${extension}`);
    }
    try {
      if (clipboard.mode === 'copy') await nexos.files.copy(clipboard.node.path, destination);
      else {
        await nexos.files.move(clipboard.node.path, destination);
        setClipboard(null);
      }
      await load();
    } catch (reason) {
      await desktop.notify(
        'Paste failed',
        reason instanceof Error ? reason.message : 'Unable to paste item.',
        'com.nexos.files',
      );
    }
  };

  const selectSource = (source: SourceMode, sourcePath?: string) => {
    setMode(source);
    setQuery('');
    setSelected(null);
    if (sourcePath) setPath(sourcePath);
  };

  const breadcrumbs = useMemo(() => {
    if (mode !== 'directory') return [];
    const parts = path.split('/').filter(Boolean);
    return parts.map((part, index) => ({
      label: part === '.Trash' ? 'Recycle Bin' : part,
      path: `/${parts.slice(0, index + 1).join('/')}`,
    }));
  }, [mode, path]);

  const openContext = (event: MouseEvent, node: FileNode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(node);
    setContext({ x: event.clientX, y: event.clientY, node });
  };

  const locationTitle = query
    ? `Search: ${query}`
    : mode === 'recent'
      ? 'Recent'
      : mode === 'favorites'
        ? 'Favourites'
        : path === '/home/.Trash'
          ? 'Recycle Bin'
          : path;

  return (
    <div className="files-app" onPointerDown={() => setContext(null)}>
      <header className="files-toolbar">
        <div className="files-nav-buttons">
          <IconButton
            label="Back"
            disabled={historyIndex === 0}
            onClick={() => {
              const index = historyIndex - 1;
              const next = history[index];
              if (next) {
                setHistoryIndex(index);
                navigate(next, false);
              }
            }}
          >
            <ArrowLeft size={17} />
          </IconButton>
          <IconButton
            label="Forward"
            disabled={historyIndex >= history.length - 1}
            onClick={() => {
              const index = historyIndex + 1;
              const next = history[index];
              if (next) {
                setHistoryIndex(index);
                navigate(next, false);
              }
            }}
          >
            <ArrowRight size={17} />
          </IconButton>
          <IconButton label="Refresh" onClick={() => void load()}>
            <RefreshCw size={16} />
          </IconButton>
        </div>
        <nav className="breadcrumbs" aria-label="Current location">
          {mode !== 'directory' ? (
            <strong>{locationTitle}</strong>
          ) : (
            <>
              <button type="button" onClick={() => navigate('/')}>
                <HardDrive size={15} />
              </button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.path}>
                  <ChevronRight size={14} />
                  <button type="button" onClick={() => navigate(crumb.path)}>
                    {crumb.label}
                  </button>
                </span>
              ))}
            </>
          )}
        </nav>
        <label className="files-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files"
          />
        </label>
        <div className="view-controls">
          <IconButton
            label="Grid view"
            className={view === 'grid' ? 'is-active' : ''}
            onClick={() => setView('grid')}
          >
            <Grid2X2 size={16} />
          </IconButton>
          <IconButton
            label="List view"
            className={view === 'list' ? 'is-active' : ''}
            onClick={() => setView('list')}
          >
            <List size={17} />
          </IconButton>
        </div>
      </header>
      <div className="files-layout">
        <Sidebar className="files-sidebar">
          <p>Places</p>
          <button
            type="button"
            className={mode === 'directory' && path === '/home' ? 'is-active' : ''}
            onClick={() => selectSource('directory', '/home')}
          >
            <Home size={17} /> Home
          </button>
          <button
            type="button"
            className={mode === 'recent' ? 'is-active' : ''}
            onClick={() => selectSource('recent')}
          >
            <Clock3 size={17} /> Recent
          </button>
          <button
            type="button"
            className={mode === 'favorites' ? 'is-active' : ''}
            onClick={() => selectSource('favorites')}
          >
            <Star size={17} /> Favourites
          </button>
          <p>Folders</p>
          {['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'].map((folder) => (
            <button
              key={folder}
              type="button"
              className={mode === 'directory' && path === `/home/${folder}` ? 'is-active' : ''}
              onClick={() => selectSource('directory', `/home/${folder}`)}
            >
              <Folder size={17} /> {folder}
            </button>
          ))}
          <p>System</p>
          <button
            type="button"
            className={mode === 'directory' && path === '/home/.Trash' ? 'is-active' : ''}
            onClick={() => selectSource('directory', '/home/.Trash')}
          >
            <Trash2 size={17} /> Recycle Bin
          </button>
        </Sidebar>
        <section className="files-main">
          <div className="files-commandbar">
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setName('New folder');
                  setDialog('folder');
                }}
                disabled={mode !== 'directory' || path === '/home/.Trash'}
              >
                <FolderPlus size={16} /> New folder
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setName('New file.txt');
                  setDialog('file');
                }}
                disabled={mode !== 'directory' || path === '/home/.Trash'}
              >
                <FilePlus2 size={16} /> New file
              </Button>
            </div>
            <div>
              <IconButton
                label="Paste"
                disabled={!clipboard || mode !== 'directory' || path === '/home/.Trash'}
                onClick={() => void paste()}
              >
                <Copy size={16} />
              </IconButton>
              {path === '/home/.Trash' ? (
                <Button variant="ghost" onClick={() => void nexos.files.emptyTrash().then(load)}>
                  Empty bin
                </Button>
              ) : null}
            </div>
          </div>
          <div className="files-location-heading">
            <h2>{locationTitle}</h2>
            <span>
              {nodes.length} item{nodes.length === 1 ? '' : 's'}
            </span>
          </div>
          {loading ? (
            <div className="app-loading">
              <Spinner label="Loading files" />
            </div>
          ) : error ? (
            <div className="app-error-state">
              <strong>Unable to show files</strong>
              <span>{error}</span>
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : nodes.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={31} />}
              title={query ? 'No matching files' : 'This location is empty'}
              description={
                query ? 'Try a different file name.' : 'Create a folder or file to get started.'
              }
            />
          ) : (
            <div
              className={`file-items file-items--${view}`}
              role="listbox"
              aria-label={locationTitle}
            >
              {view === 'list' ? (
                <div className="file-list-header">
                  <span>Name</span>
                  <span>Modified</span>
                  <span>Type</span>
                  <span>Size</span>
                </div>
              ) : null}
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={selected?.id === node.id ? 'is-selected' : ''}
                  onClick={() => setSelected(node)}
                  onDoubleClick={() => void open(node)}
                  onContextMenu={(event) => openContext(event, node)}
                  role="option"
                  aria-selected={selected?.id === node.id}
                >
                  <span className="file-glyph">
                    <FileGlyph node={node} />
                    {node.favorite ? (
                      <Star className="favorite-badge" size={11} fill="currentColor" />
                    ) : null}
                  </span>
                  <span className="file-name">{node.name}</span>
                  {view === 'list' ? (
                    <>
                      <time>{new Date(node.updatedAt).toLocaleDateString()}</time>
                      <span>
                        {node.kind === 'directory' ? 'Folder' : (node.mimeType ?? 'File')}
                      </span>
                      <span>{node.kind === 'file' ? formatSize(node.size) : '—'}</span>
                    </>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>
        {selected ? (
          <aside className="file-details-pane">
            <div className="file-detail-icon">
              <FileGlyph node={selected} />
            </div>
            <h3>{selected.name}</h3>
            <p>{selected.kind === 'directory' ? 'Folder' : selected.mimeType}</p>
            <dl>
              <div>
                <dt>Location</dt>
                <dd>{selected.parentPath ?? '/'}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>
                  {selected.kind === 'file'
                    ? formatSize(selected.size)
                    : `${nodes.filter((node) => node.parentPath === selected.path).length} items`}
                </dd>
              </div>
              <div>
                <dt>Modified</dt>
                <dd>{new Date(selected.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="file-detail-actions">
              {path === '/home/.Trash' ? (
                <Button onClick={() => void restore(selected)}>
                  <RotateCcw size={15} /> Restore
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void open(selected)}>
                  Open
                </Button>
              )}
              <IconButton
                label="More actions"
                onClick={(event) =>
                  setContext({ x: event.clientX, y: event.clientY, node: selected })
                }
              >
                <MoreHorizontal size={17} />
              </IconButton>
            </div>
          </aside>
        ) : null}
      </div>

      {context ? (
        <Menu
          className="file-context-menu"
          style={{ left: context.x, top: context.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MenuItem onClick={() => void open(context.node)}>
            <FolderOpen size={15} /> Open
          </MenuItem>
          {path === '/home/.Trash' ? (
            <MenuItem onClick={() => void restore(context.node)}>
              <RotateCcw size={15} /> Restore
            </MenuItem>
          ) : (
            <>
              <MenuItem
                onClick={() => {
                  setClipboard({ node: context.node, mode: 'copy' });
                  setContext(null);
                }}
              >
                <Copy size={15} /> Copy
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setClipboard({ node: context.node, mode: 'move' });
                  setContext(null);
                }}
              >
                <ArrowRight size={15} /> Cut
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setName(context.node.name);
                  setDialog('rename');
                  setContext(null);
                }}
              >
                <Pencil size={15} /> Rename
              </MenuItem>
              <MenuItem
                onClick={() =>
                  void nexos.files.setFavorite(context.node.path, !context.node.favorite).then(load)
                }
              >
                <Heart size={15} />{' '}
                {context.node.favorite ? 'Remove favourite' : 'Add to favourites'}
              </MenuItem>
            </>
          )}
          <MenuItem
            onClick={() => {
              setDialog('details');
              setContext(null);
            }}
          >
            <Info size={15} /> Details
          </MenuItem>
          <MenuItem
            className="danger"
            onClick={() => {
              setDialog('delete');
              setContext(null);
            }}
          >
            <Trash2 size={15} />{' '}
            {path === '/home/.Trash' ? 'Delete permanently' : 'Move to recycle bin'}
          </MenuItem>
        </Menu>
      ) : null}

      <Dialog
        open={dialog === 'folder' || dialog === 'file' || dialog === 'rename'}
        title={
          dialog === 'folder' ? 'Create folder' : dialog === 'file' ? 'Create file' : 'Rename item'
        }
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitName()} disabled={!name.trim()}>
              {dialog === 'rename' ? 'Rename' : 'Create'}
            </Button>
          </>
        }
      >
        <label className="dialog-field">
          <span>Name</span>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitName();
            }}
          />
        </label>
      </Dialog>
      <Dialog
        open={dialog === 'delete'}
        title={path === '/home/.Trash' ? 'Delete permanently?' : 'Move to recycle bin?'}
        description={selected?.name}
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              {path === '/home/.Trash' ? 'Delete permanently' : 'Move to bin'}
            </Button>
          </>
        }
      >
        <p>
          {path === '/home/.Trash'
            ? 'This action cannot be undone.'
            : 'You can restore this item from the recycle bin.'}
        </p>
      </Dialog>
      <Dialog
        open={dialog === 'details'}
        title="File details"
        onClose={() => setDialog(null)}
        actions={<Button onClick={() => setDialog(null)}>Done</Button>}
      >
        {selected ? (
          <dl className="details-dialog">
            <div>
              <dt>Name</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{selected.path}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{selected.kind === 'directory' ? 'Directory' : selected.mimeType}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{formatSize(selected.size)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
        ) : null}
      </Dialog>
    </div>
  );
}
