import { useEffect, useRef } from 'react';

/**
 * Listen for a window event with the latest `handler` (so it can read current
 * props and state) while subscribing only once.
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  capture = false,
): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener = (e: WindowEventMap[K]) => latest.current(e);
    window.addEventListener(type, listener, capture);
    return () => window.removeEventListener(type, listener, capture);
  }, [type, capture]);
}
