/**
 * Overlay components: Modal (native <dialog>), Toast notifications, Tabs
 */
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import './Overlay.css';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Label for the close button (translated by the caller) */
  closeLabel: string;
}

/**
 * Modal dialog: native <dialog> gives focus trapping, Esc to close and inert background
 */
export const Modal: React.FC<ModalProps> = ({ open, title, onClose, children, footer, closeLabel }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself) closes it
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="modal__panel">
        <header className="modal__header">
          <h2 id="modal-title" className="modal__title">
            {title}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label={closeLabel}>
            <Icon name="x" size={20} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </dialog>
  );
};

type ToastTone = 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

/** How long a toast stays visible */
const TOAST_DURATION_MS = 3500;

/**
 * Provides toast() to the tree and renders the toast stack
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <Icon name={t.tone === 'danger' ? 'x' : t.tone === 'info' ? 'sparkles' : 'check'} size={18} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/**
 * Returns the toast(message, tone) function
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): (message: string, tone?: ToastTone) => void {
  return useContext(ToastContext);
}

interface TabsProps<T extends string> {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}

/**
 * Segmented tab switcher (roving focus with arrow keys)
 */
export function Tabs<T extends string>({ tabs, active, onChange, label }: TabsProps<T>): React.JSX.Element {
  const handleKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          className={`tabs__tab ${active === tab.id ? 'tabs__tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tabs__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
