/** Remembers the room you're in, so a refresh or dropped connection puts you back in your seat. */
export interface Session {
  code: string;
  token: string;
  name: string;
}

const SESSION_KEY = 'uno.session';
const NAME_KEY = 'uno.name';

// Storage can be unavailable (private mode, blocked cookies); everything still works, just without memory.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not remembered; that's fine.
  }
}

export function loadSession(): Session | null {
  try {
    const parsed = JSON.parse(read(SESSION_KEY) ?? 'null') as Session | null;
    return parsed && typeof parsed.code === 'string' && typeof parsed.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  write(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  write(SESSION_KEY, null);
}

export function loadName(): string {
  return read(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  write(NAME_KEY, name);
}

/** Keeps `?room=CODE` in the address bar while in a lobby, so refreshing returns there. */
export function setRoomInUrl(code: string | null): void {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

export function roomFromUrl(): string | null {
  return new URLSearchParams(location.search).get('room');
}

export function inviteLink(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', code);
  return url.toString();
}
