/**
 * PageFallback
 * Shown while a page's code loads
 */
import type React from 'react';
import { Spinner } from '@/design';

export const PageFallback: React.FC = () => (
  <div className="page-fallback">
    <Spinner size={32} />
  </div>
);
