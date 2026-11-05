/**
 * When to suggest adding the app to the home screen: only on an iPhone or iPad in Safari (the one place it cannot
 * be done with a button), not once it is already installed, after a few days of use, and never again once the
 * learner has answered "later" or "understood".
 */
const DAYS_KEY = 'english-tool:install-days';
const DISMISS_KEY = 'english-tool:install-dismissed';
/** Distinct days the app must have been opened before the hint appears */
const AFTER_DAYS = 3;

export const isIos = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isInstalled = (): boolean => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Notes today as a day the app was opened */
export function noteVisit(today = new Date().toISOString().slice(0, 10)): number {
  try {
    const days: string[] = JSON.parse(localStorage.getItem(DAYS_KEY) ?? '[]');
    if (!days.includes(today)) {
      days.push(today);
      localStorage.setItem(DAYS_KEY, JSON.stringify(days.slice(-30)));
    }
    return days.length;
  } catch {
    return 0;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Without storage it may come back; that is acceptable
  }
}

export function shouldSuggestInstall(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY)) return false;
  } catch {
    return false;
  }
  return isIos() && !isInstalled() && noteVisit() >= AFTER_DAYS;
}
