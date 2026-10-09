/**
 * Form controls: Field wrapper, TextInput, Select, ChoiceCards
 */
import type React from 'react';
import { useId } from 'react';
import { Icon, type IconName } from './Icon';
import './Form.css';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Receives the generated id to wire label and control together */
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}

/**
 * Label + control + hint/error, with accessible wiring
 */
export const Field: React.FC<FieldProps> = ({ label, hint, error, children }) => {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(id, message ? messageId : undefined)}
      {message && (
        <p id={messageId} className="field__message" role={error ? 'alert' : undefined}>
          {message}
        </p>
      )}
    </div>
  );
};

/**
 * Text input styled as a soft sunken well
 */
export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input className={`input ${className}`} {...rest} />
);

/**
 * Native select with a custom chevron
 */
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...rest }) => (
  <select className={`input select ${className}`} {...rest} />
);

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName;
  tone?: string;
}

interface ChoiceCardsProps<T extends string> {
  name: string;
  legend: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: number;
}

/**
 * Big tappable radio cards, used in onboarding and settings
 */
export function ChoiceCards<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 3,
}: ChoiceCardsProps<T>): React.JSX.Element {
  return (
    <fieldset className="choices">
      <legend className="field__label">{legend}</legend>
      <div className="choices__grid" style={{ ['--choice-cols' as string]: columns }}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`choice ${value === option.value ? 'choice--selected' : ''}`}
            style={option.tone ? { ['--choice-tone' as string]: `var(--${option.tone})` } : undefined}
          >
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.icon && (
              <span className="choice__icon">
                <Icon name={option.icon} size={24} />
              </span>
            )}
            <span className="choice__label">{option.label}</span>
            {option.description && <span className="choice__description">{option.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
