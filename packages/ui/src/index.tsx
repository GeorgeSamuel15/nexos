import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export function Button({
  className,
  variant = 'primary',
  ...properties
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={clsx('nx-button', `nx-button--${variant}`, className)} {...properties} />
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function IconButton({ className, label, ...properties }, reference) {
  return (
    <button
      ref={reference}
      type="button"
      className={clsx('nx-icon-button', className)}
      aria-label={label}
      title={label}
      {...properties}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...properties }, reference) {
    return <input ref={reference} className={clsx('nx-input', className)} {...properties} />;
  },
);

export function Card({ className, ...properties }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('nx-card', className)} {...properties} />;
}

export interface DialogProperties extends PropsWithChildren {
  open: boolean;
  title: string;
  description?: string | undefined;
  onClose(): void;
  actions?: ReactNode | undefined;
  className?: string | undefined;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  actions,
  children,
  className,
}: DialogProperties) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="nx-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={clsx('nx-dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nx-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="nx-dialog__header">
          <div>
            <h2 id="nx-dialog-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        <div className="nx-dialog__content">{children}</div>
        {actions ? <footer className="nx-dialog__actions">{actions}</footer> : null}
      </section>
    </div>
  );
}

export const Modal = Dialog;

export function Menu({ className, ...properties }: HTMLAttributes<HTMLDivElement>) {
  return <div role="menu" className={clsx('nx-menu', className)} {...properties} />;
}

export const ContextMenu = Menu;

export function MenuItem({ className, ...properties }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button role="menuitem" className={clsx('nx-menu-item', className)} {...properties} />;
}

export function Tooltip({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <span className="nx-tooltip" data-tooltip={label}>
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx('nx-toggle', checked && 'is-checked')}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Slider({
  label,
  ...properties
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <input aria-label={label} className="nx-slider" type="range" {...properties} />;
}

export function Select({ className, ...properties }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx('nx-select', className)} {...properties} />;
}

interface TabsContextValue {
  value: string;
  onChange(value: string): void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onChange,
  children,
  className,
}: PropsWithChildren<{ value: string; onChange(value: string): void; className?: string }>) {
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={clsx('nx-tabs', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function Tab({ value, children }: PropsWithChildren<{ value: string }>) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be rendered inside Tabs.');
  return (
    <button
      type="button"
      role="tab"
      aria-selected={context.value === value}
      className={clsx('nx-tab', context.value === value && 'is-active')}
      onClick={() => context.onChange(value)}
    >
      {children}
    </button>
  );
}

export function Sidebar({ className, ...properties }: HTMLAttributes<HTMLElement>) {
  return <aside className={clsx('nx-sidebar', className)} {...properties} />;
}

export function Field({
  label,
  hint,
  children,
}: PropsWithChildren<{ label: string; hint?: string }>) {
  const id = useId();
  return (
    <label className="nx-field" htmlFor={id}>
      <span className="nx-field__label">{label}</span>
      {children}
      {hint ? <span className="nx-field__hint">{hint}</span> : null}
    </label>
  );
}

export function WindowSurface({ className, ...properties }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('nx-window-surface', className)} {...properties} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="nx-empty-state">
      <div className="nx-empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="nx-spinner" role="status" aria-label={label} />;
}
