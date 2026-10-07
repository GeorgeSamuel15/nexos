import { useEffect, useState } from 'react';
import { FolderOpen, Image as ImageIcon, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import { Button, Dialog, EmptyState, IconButton, Input, Spinner } from '@nexos/ui';

import type { ApplicationProperties } from './registry';

export default function ImageViewerApp({ window }: ApplicationProperties) {
  const [path, setPath] = useState<string | null>(window.payload['path'] ?? null);
  const [openPath, setOpenPath] = useState('/home/Pictures/');
  const [dialog, setDialog] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const [content, stat] = await Promise.all([
        nexos.files.readFile(nextPath),
        nexos.files.stat(nextPath),
      ]);
      const mime = stat.mimeType ?? 'image/png';
      const nextSource = content.startsWith('data:')
        ? content
        : mime === 'image/svg+xml' && content.trimStart().startsWith('<svg')
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
          : `data:${mime};base64,${content}`;
      setSource(nextSource);
      setPath(nextPath);
      setOpenPath(nextPath);
      setZoom(1);
      setRotation(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open image.');
      setSource(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const requested = window.payload['path'];
    if (requested) void load(requested);
  }, [window.payload]);

  return (
    <div className="image-viewer-app">
      <header>
        <Button variant="ghost" onClick={() => setDialog(true)}>
          <FolderOpen size={16} /> Open image
        </Button>
        <span>{path ?? 'No image selected'}</span>
        <div>
          <IconButton
            label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.2, value - 0.1))}
          >
            <ZoomOut size={17} />
          </IconButton>
          <strong>{Math.round(zoom * 100)}%</strong>
          <IconButton label="Zoom in" onClick={() => setZoom((value) => Math.min(5, value + 0.1))}>
            <ZoomIn size={17} />
          </IconButton>
          <IconButton label="Rotate image" onClick={() => setRotation((value) => value + 90)}>
            <RotateCw size={17} />
          </IconButton>
        </div>
      </header>
      <section className="image-canvas">
        {loading ? (
          <Spinner label="Loading image" />
        ) : error ? (
          <div className="app-error-state">
            <ImageIcon size={32} />
            <strong>Image could not be opened</strong>
            <span>{error}</span>
          </div>
        ) : source ? (
          <img
            src={source}
            alt={path?.split('/').at(-1) ?? 'NexOS image'}
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          />
        ) : (
          <EmptyState
            icon={<ImageIcon size={33} />}
            title="Open an image"
            description="Choose a PNG, JPEG, GIF, or SVG from the NexOS filesystem."
            action={
              <Button onClick={() => setDialog(true)}>
                <FolderOpen size={16} /> Choose image
              </Button>
            }
          />
        )}
      </section>
      <Dialog
        open={dialog}
        title="Open image"
        onClose={() => setDialog(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void load(openPath).then(() => setDialog(false))}>Open</Button>
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
