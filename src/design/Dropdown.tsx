/**
 * Dropdown
 * Single-choice menu that matches the app's own panels (the browser's native select popup cannot be styled).
 * Keyboard: Arrow keys, Home/End, Enter or Space to choose, Esc to close.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import './Dropdown.css';

interface DropdownProps<T extends string> {
  /** Accessible name of the control */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

export function Dropdown<T extends string>({ label, value, options, onChange, className = '' }: DropdownProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  // Close on an outside click
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  // Move focus onto the chosen option when the menu opens
  useEffect(() => {
    if (open) items.current[selectedIndex]?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };

  const focusItem = (index: number): void => {
    const count = options.length;
    items.current[((index % count) + count) % count]?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent): void => {
    const current = items.current.findIndex((item) => item === document.activeElement);
    const moves: Record<string, () => void> = {
      ArrowDown: () => focusItem(current + 1),
      ArrowUp: () => focusItem(current - 1),
      Home: () => focusItem(0),
      End: () => focusItem(options.length - 1),
      Escape: close,
      Tab: () => setOpen(false),
    };
    const move = moves[event.key];
    if (!move) return;
    if (event.key !== 'Tab') event.preventDefault();
    move();
  };

  return (
    <div className={`dropdown ${className}`} ref={root}>
      <button
        ref={button}
        type="button"
        className="input dropdown__button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="dropdown__value">{options[selectedIndex]?.label}</span>
        <span className={`dropdown__chevron ${open ? 'dropdown__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="dropdown__panel" id={listId} role="listbox" aria-label={label} onKeyDown={onMenuKey}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => {
                items.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`dropdown__option ${option.value === value ? 'dropdown__option--active' : ''}`}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              {option.label}
              {option.value === value && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
