import type { KeyboardEvent } from 'react';

/**
 * Checks whether a React keyboard event occurred while an Input Method Editor (IME)
 * such as Vietnamese Telex/VNI is actively composing text.
 * Checks both `nativeEvent.isComposing` and legacy `keyCode === 229` (Safari WebKit guard).
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return Boolean(event.nativeEvent.isComposing || event.keyCode === 229);
}

/**
 * Wraps a submit/action callback for Enter-key handlers so IME composition
 * confirmations and Shift+Enter multiline linebreaks are never intercepted.
 */
export function onImeSafeEnter(handler: () => void): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    if (event.shiftKey || isImeComposing(event)) return;
    event.preventDefault();
    handler();
  };
}
