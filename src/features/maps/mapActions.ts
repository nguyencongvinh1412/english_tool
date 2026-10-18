/**
 * Callbacks the map nodes call. The object is created once, so nodes do not re-render because of it.
 */
import { createContext } from 'react';

export interface MapActions {
  commitText: (id: string, text: string, then?: 'child') => void;
  cancelEdit: () => void;
  toggle: (id: string) => void;
}

export const MapActionsContext = createContext<MapActions | null>(null);
