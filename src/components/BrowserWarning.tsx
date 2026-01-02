/**
 * BrowserWarning Component
 * Displays warning when browser lacks required features
 * Suggests compatible browsers for best experience
 */

import type React from 'react';
import { useBrowserCheck } from '@/hooks/useBrowserCheck';

/**
 * Browser compatibility warning banner
 * Only renders when required features are unavailable
 *
 * @example
 * ```tsx
 * <BrowserWarning />
 * ```
 */
export function BrowserWarning(): React.JSX.Element | null {
  const { isSupported, unsupportedFeatures } = useBrowserCheck();

  // Don't render if browser is fully supported
  if (isSupported) {
    return null;
  }

  return (
    <div className="browser-warning" role="alert" aria-live="polite">
      <h3 className="browser-warning__title">Browser Not Fully Supported</h3>
      <p className="browser-warning__description">
        The following features are not available in your browser:
      </p>
      <ul className="browser-warning__list">
        {unsupportedFeatures.map((feature) => (
          <li key={feature} className="browser-warning__item">
            {feature}
          </li>
        ))}
      </ul>
      <p className="browser-warning__recommendation">
        For the best experience, please use{' '}
        <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
      </p>
    </div>
  );
}
