/**
 * Alert Component
 * Displays notification messages with different severity levels
 * Supports dismissible alerts with callback
 */

import type React from 'react';

/** Alert type variants */
type AlertType = 'error' | 'warning' | 'success' | 'info';

interface AlertProps {
  /** Type/severity of the alert */
  type: AlertType;
  /** Message content to display */
  message: string;
  /** Optional callback when alert is dismissed */
  onDismiss?: () => void;
  /** Additional CSS class name */
  className?: string;
}

/** Maps alert types to ARIA roles for accessibility */
const ALERT_ROLES: Record<AlertType, 'alert' | 'status'> = {
  error: 'alert',
  warning: 'alert',
  success: 'status',
  info: 'status',
};

/**
 * Alert notification component for displaying messages
 *
 * @example
 * ```tsx
 * <Alert
 *   type="error"
 *   message="Failed to save changes"
 *   onDismiss={() => setError(null)}
 * />
 * ```
 */
export function Alert({
  type,
  message,
  onDismiss,
  className = '',
}: AlertProps): React.JSX.Element {
  const baseClass = 'alert';
  const typeClass = `${baseClass}-${type}`;
  const classes = [baseClass, typeClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role={ALERT_ROLES[type]} aria-live="polite">
      <span className="alert__message">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="alert__dismiss-btn"
          type="button"
          aria-label="Dismiss alert"
        >
          &times;
        </button>
      )}
    </div>
  );
}
