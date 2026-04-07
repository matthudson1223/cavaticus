/**
 * Debug utility for verbose logging
 * Enabled via:
 * 1. Environment variable: VITE_DEBUG=true
 * 2. URL query param: ?verbose=true
 * 3. localStorage: cavaticus_debug
 */

type DebugListener = (component: string, message: string, data?: unknown) => void;
const listeners: Set<DebugListener> = new Set();

const getDebugFlag = (): boolean => {
  // Check env var (build-time)
  if (import.meta.env.VITE_DEBUG === 'true') return true;

  // Check URL param
  const params = new URLSearchParams(window.location.search);
  if (params.has('verbose')) {
    localStorage.setItem('cavaticus_debug', 'true');
    return true;
  }

  // Check localStorage
  return localStorage.getItem('cavaticus_debug') === 'true';
};

const debugEnabled = getDebugFlag();

export function debug(component: string, message: string, data?: unknown) {
  if (!debugEnabled) return;
  const timestamp = new Date().toISOString();
  const logMsg = `[cavaticus:${component}] ${timestamp} ${message}`;

  if (data) {
    console.log(logMsg, data);
  } else {
    console.log(logMsg);
  }

  // Emit to listeners (for inline chat display)
  listeners.forEach(listener => listener(component, message, data));
}

export function onDebug(listener: DebugListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toggleDebug() {
  const current = localStorage.getItem('cavaticus_debug') === 'true';
  if (current) {
    localStorage.removeItem('cavaticus_debug');
    console.log('[cavaticus:debug] Verbose mode disabled');
    window.location.reload();
  } else {
    localStorage.setItem('cavaticus_debug', 'true');
    console.log('[cavaticus:debug] Verbose mode enabled');
    window.location.reload();
  }
}

export const isDebugEnabled = debugEnabled;
