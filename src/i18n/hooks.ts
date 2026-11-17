import { useEffect, useState } from 'preact/hooks';
import { chooseLocale, chooseUnit, getLocale, getUnit, subscribe } from './index';

// Re-renders the component whenever the language or the unit changes. A parent that calls it re-renders its children too.
export function useLocale() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick(n => n + 1)), []);
  return { locale: getLocale(), unit: getUnit(), setLocale: chooseLocale, setUnit: chooseUnit };
}
