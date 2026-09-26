import { useEffect, useState } from 'react';

/** Current `location.hash`, kept in sync with back/forward and link changes. Hash routes need no
 * server-side SPA rewrite, so a reload on `#/history` works on any static host. */
export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}
