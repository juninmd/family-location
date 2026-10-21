import { useEffect, useState } from 'react';
import { startRealtime } from './lib/socket';
import { getState, setTab, useStore, type Tab } from './lib/store';
import { startTracking } from './lib/tracker';
import { MapView } from './map/MapView';
import { AddPerson } from './ui/AddPerson';
import { IBell, IMap, IPin, IUser } from './ui/Icons';
import { MapButtons, MapHeader, PeopleDock, PlaceComposer } from './ui/MapOverlay';
import { Onboarding } from './ui/Onboarding';
import { Activity, Places, Profile } from './ui/Pages';
import { SosModal } from './ui/Sos';

function useIsDark() {
  const theme = useStore((s) => s.theme);
  const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setSys(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return theme === 'dark' || (theme === 'auto' && sys);
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'map', label: 'Mapa', icon: <IMap /> },
  { id: 'activity', label: 'Atividade', icon: <IBell /> },
  { id: 'places', label: 'Lugares', icon: <IPin /> },
  { id: 'profile', label: 'Perfil', icon: <IUser /> },
];

export default function App() {
  const creds = useStore((s) => s.creds);
  const me = useStore((s) => s.me);
  const tab = useStore((s) => s.tab);
  const unread = useStore((s) => s.unread);
  const addOpen = useStore((s) => s.addOpen);
  const sosOpen = useStore((s) => s.sosOpen);
  const pick = useStore((s) => s.pickPlace);
  const selected = useStore((s) => s.selected);
  const toast = useStore((s) => s.toast);
  const dark = useIsDark();

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1020' : '#f4f6ff');
  }, [dark]);

  useEffect(() => {
    const c = getState().creds;
    if (!c) return;
    startRealtime(c);
    void startTracking();
  }, []);

  if (!creds) return <Onboarding />;

  return (
    <div className={`app tab-${tab}${selected ? ' has-sel' : ''}${pick ? ' picking' : ''}`}>
      <MapView dark={dark} />
      {tab === 'map' && (
        <>
          <MapHeader />
          <MapButtons />
          {pick ? <PlaceComposer /> : <PeopleDock />}
        </>
      )}
      {tab === 'activity' && <Activity />}
      {tab === 'places' && <Places />}
      {tab === 'profile' && me && <Profile />}

      <nav className="nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="nav-ico">
              {t.icon}
              {t.id === 'activity' && unread > 0 && <i className="badge">{unread > 9 ? '9+' : unread}</i>}
            </span>
            <small>{t.label}</small>
          </button>
        ))}
      </nav>

      {addOpen && <AddPerson />}
      {sosOpen && <SosModal />}
      {toast && <div key={toast.id} className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
