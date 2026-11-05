import { useSearchParams } from 'react-router-dom';

/** Whether the exercise was opened from Today, and the minutes Today planned for it */
export function useFromToday(): { fromToday: boolean; minutes: number | null } {
  const [params] = useSearchParams();
  const minutes = Number(params.get('min'));
  return { fromToday: params.get('from') === 'today', minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null };
}
