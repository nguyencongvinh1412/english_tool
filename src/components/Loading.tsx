/**
 * Loading Component
 * Displays a loading spinner with optional message
 * Supports multiple sizes for different contexts
 */

import type React from 'react';

/** Size variants for the loading spinner */
type LoadingSize = 'small' | 'medium' | 'large';

interface LoadingProps {
  /** Message to display below spinner */
  message?: string;
  /** Size of the spinner */
  size?: LoadingSize;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Loading spinner component with configurable size and message
 *
 * @example
 * ```tsx
 * <Loading message="Loading data..." size="medium" />
 * ```
 */
export function Loading({
  message = 'Loading...',
  size = 'medium',
  className = '',
}: LoadingProps): React.JSX.Element {
  const baseClass = 'loading-spinner';
  const classes = [baseClass, size, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span className="loading-spinner__message">{message}</span>
    </div>
  );
}
