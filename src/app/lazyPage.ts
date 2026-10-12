/**
 * Route-level code splitting: pages load on first visit
 */
import { lazy, type ComponentType } from 'react';

/**
 * Lazy component from a module's named export
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<M extends Record<string, ComponentType<any>>, K extends keyof M & string>(loader: () => Promise<M>, name: K) {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}
