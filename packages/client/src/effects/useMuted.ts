import { useEffect, useState } from 'react';
import { isMuted, onMutedChange, setMuted } from './sound';

/** Whether game sounds are muted, kept in sync across the app. */
export function useMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setState] = useState(isMuted);
  useEffect(() => {
    const stop = onMutedChange(setState);
    return () => {
      stop();
    };
  }, []);
  return [muted, setMuted];
}
