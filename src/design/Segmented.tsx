/**
 * Segmented
 * Pill toggle group, e.g. difficulty levels; each option can carry its own color
 */
import type React from 'react';
import './Segmented.css';

interface SegmentedProps<T extends string> {
  label: string;
  options: { value: T; label: string; tone?: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>): React.JSX.Element {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={`segmented__option ${value === option.value ? 'segmented__option--active' : ''}`}
          style={option.tone ? { ['--seg-tone' as string]: `var(--${option.tone})` } : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
