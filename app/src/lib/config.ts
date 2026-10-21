import { isNative, kv } from './native';

const BUILD_SERVER = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'https://family-location.antonio-code.duckdns.org';

export const defaultServer = () => (isNative ? BUILD_SERVER : location.origin);
export const getServer = () => kv.get<string>('server', '') || defaultServer();
export const setServer = (url: string) => {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean || clean === defaultServer()) kv.del('server');
  else kv.set('server', clean);
};
export const wsUrl = () => getServer().replace(/^http/, 'ws') + '/ws';

/** Estilos OpenFreeMap: gratuito, sem chave. Configurável para self-host. */
export const MAP_STYLE_URL = (import.meta.env.VITE_MAP_STYLE as string | undefined) ?? 'https://tiles.openfreemap.org/styles/liberty';
