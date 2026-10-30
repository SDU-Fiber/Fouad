import { useEffect, useState } from 'react';

// Tiny hash router: #/meetings, #/rooms/<id>, #/meet/<id>, #/join/<token> …
// Hash routing keeps the app a single static bundle that can be hosted anywhere.

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function parseHash(hash = location.hash): Route {
  const raw = hash.replace(/^#/, '') || '/dashboard';
  const [path = '/dashboard', qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (location.hash !== target) location.hash = target;
};
