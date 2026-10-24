/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server address; defaults to the site's own address. */
  readonly VITE_SERVER_URL?: string;
  /** Set to "off" for builds with no game server (online play is hidden). */
  readonly VITE_ONLINE?: string;
}
