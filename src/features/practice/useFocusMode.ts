/**
 * Focus mode: while an exercise is open the app's navigation steps out of the way (no sidebar, header or tab bar),
 * so the only ways out are the exercise's own close button and its link back to Today.
 */
import { useEffect } from 'react';

export function useFocusMode(): void {
  useEffect(() => {
    document.documentElement.classList.add('focus');
    return () => document.documentElement.classList.remove('focus');
  }, []);
}
