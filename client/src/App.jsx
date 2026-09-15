import { useCallback, useEffect, useRef, useState } from 'react';
import { api, DEFAULT_FILTERS, subscribe } from './lib/api.js';
import SearchConfig from './components/SearchConfig.jsx';
import LiveScanner from './components/LiveScanner.jsx';
import LeadResults from './components/LeadResults.jsx';
import LeadDrawer from './components/LeadDrawer.jsx';
import Analytics from './components/Analytics.jsx';
import ExportPanel from './components/ExportPanel.jsx';
import { StatusChip } from './components/ui.jsx';
import OutreachSettings from './components/OutreachSettings.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { mergeSettings } from './lib/outreach.js';

const NAV = [
  ['configure', '01', 'Search Configuration'],
  ['scanner', '02', 'Live Scanner'],
  ['leads', '03', 'Lead Results'],
  ['analytics', '04', 'Analytics'],
  ['export', '05', 'Export'],
  ['outreach', '06', 'Outreach'],
  ['settings', '07', 'Settings'],
];
const INITIAL_VIEW = NAV.some(([id]) => id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : null;

export default function App() {
  const [meta, setMeta] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [view, setView] = useState(INITIAL_VIEW || 'configure');
  const [scans, setScans] = useState([]);
  const [scanId, setScanId] = useState(null);
  const [scan, setScan] = useState(null);
  const [apiFeed, setApiFeed] = useState([]);
  const [leadsVersion, setLeadsVersion] = useState(0);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selected, setSelected] = useState(() => new Set());
  const [leadId, setLeadId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [live, setLive] = useState(false);
  const [settings, setSettings] = useState(() => mergeSettings());
  const [followUps, setFollowUps] = useState({ due: 0, upcoming: 0 });
  const [leadOrder, setLeadOrder] = useState([]);

  useEffect(() => { window.history.replaceState(null, '', `#${view}`); }, [view]);

  const scanIdRef = useRef(scanId);
  scanIdRef.current = scanId;

  const notify = useCallback((message, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const refreshScans = useCallback(() => api.get('/scans').then((list) => { setScans(list); return list; }), []);

  useEffect(() => {
    api.get('/meta').then(setMeta).catch((e) => setServerError(e.message));
    api.get('/settings').then((s) => setSettings(mergeSettings(s))).catch(() => {});
    refreshScans().then((list) => {
      const pick = list.find((s) => s.active) || list[0];
      if (pick) { setScanId(pick.id); if (!INITIAL_VIEW) setView(pick.active ? 'scanner' : 'leads'); }
    }).catch(() => {});
  }, [refreshScans]);

  useEffect(() => {
    if (!scanId) { setScan(null); return; }
    api.get(`/scans/${scanId}`).then(setScan).catch(() => {});
  }, [scanId]);

  useEffect(() => { api.get('/followups').then(setFollowUps).catch(() => {}); }, [leadsVersion]);

  // Live events arrive fast during a scan; batch lead-table refreshes to one every 2s.
  const refreshTimer = useRef(null);
  const bumpLeads = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; setLeadsVersion((v) => v + 1); }, 2000);
  }, []);

  useEffect(() => subscribe(({ type, data, ts }) => {
    const mine = data.scanId === scanIdRef.current;
    if (type === 'scan:progress') {
      if (mine) setScan((s) => s && { ...s, stats: { ...s.stats, ...data.stats }, active: data.active, status: data.status || s.status });
      bumpLeads();
    } else if (type === 'scan:log') {
      if (mine) setScan((s) => s && { ...s, logs: [...s.logs.slice(-199), data] });
    } else if (type === 'scan:status') {
      refreshScans().catch(() => {});
      if (mine) api.get(`/scans/${data.scanId}`).then(setScan).catch(() => {});
      if (data.error) notify(`Scan #${data.scanId}: ${data.error}`, 'error');
      else if (data.status === 'paused' && data.note) notify(`Scan #${data.scanId} paused: ${data.note}`, 'error');
      bumpLeads();
    } else if (type === 'lead:updated') {
      bumpLeads();
    } else if (type === 'api') {
      setApiFeed((f) => [{ ...data, ts }, ...f].slice(0, 80));
      if (data.outcome === 'error' && data.httpCode && data.httpCode !== 429) notify(`Places API ${data.httpCode}: ${data.error}`, 'error');
    }
  }, (ok) => { setLive(ok); if (ok) setServerError(null); }), [bumpLeads, refreshScans, notify]);

  const scanAction = useCallback(async (action, id, body) => {
    try {
      if (action === 'delete') {
        await api.del(`/scans/${id}`);
        if (id === scanIdRef.current) setScanId(null);
      } else {
        const s = await api.post(`/scans/${id}/${action}`, body);
        if (id !== scanIdRef.current) setScanId(id);
        setScan(s);
      }
      refreshScans();
    } catch (e) { notify(e.message, 'error'); }
  }, [notify, refreshScans]);

  const openScan = (id) => { setScanId(id); setSelected(new Set()); setFilters((f) => ({ ...f, scope: 'scan', page: 0 })); setView('scanner'); };
  const onStarted = (s) => { setScanId(s.id); setScan(s); setSelected(new Set()); setFilters((f) => ({ ...f, scope: 'scan', page: 0 })); setView('scanner'); refreshScans(); };
  const openLeads = (patch, scope) => {
    setSelected(new Set());
    setFilters({ ...DEFAULT_FILTERS, scope: scope === 'scan' && scanId ? 'scan' : 'all', ...patch });
    setView('leads');
  };
  // Limits are saved through /limits (validated); never send a possibly stale copy with outreach settings.
  const saveSettings = async ({ limits, ...next }) => setSettings(mergeSettings(await api.put('/settings', next))); // eslint-disable-line no-unused-vars
  const leadIndex = leadId ? leadOrder.indexOf(leadId) : -1;
  const closeLead = useCallback(() => setLeadId(null), []);
  const bump = useCallback(() => setLeadsVersion((v) => v + 1), []);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">◎</span>
          <div><b>Lead Scout</b><small>Local sales intelligence</small></div>
        </div>
        <nav>
          {NAV.map(([id, n, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
              <span className="nav-n">{n}</span>{label}
              {id === 'scanner' && scan?.active && <span className="pulse" />}
              {id === 'leads' && followUps.due > 0 && (
                <span className="ml-auto rounded-full bg-hot px-1.5 text-[11px] leading-[18px] font-bold text-white" title="Follow-ups due today">{followUps.due}</span>
              )}
            </button>
          ))}
        </nav>
        {scan && (
          <button className="rail-scan" onClick={() => setView('scanner')}>
            <small>Scan #{scan.id}</small>
            <b>{scan.config.categoryLabel}</b>
            <span>{scan.config.area}, {scan.config.country}</span>
            <StatusChip status={scan.active ? 'running' : scan.status} />
          </button>
        )}
        <div className="rail-foot">
          <span className={`conn ${live ? 'ok' : ''}`} />{live ? 'Live connection' : 'Connecting to server…'}
        </div>
      </aside>

      <main className="main">
        {serverError && <div className="banner error">Cannot reach the API server ({serverError}). Start everything with <code>npm run dev</code>.</div>}
        {view === 'configure' && <SearchConfig meta={meta} scans={scans} onStarted={onStarted} notify={notify} />}
        {view === 'scanner' && (
          <LiveScanner scan={scan} scans={scans} apiFeed={apiFeed} leadsVersion={leadsVersion} onAction={scanAction}
            onOpenScan={openScan} onOpenLead={setLeadId} onNew={() => setView('configure')} />
        )}
        {view === 'leads' && (
          <LeadResults scanId={scanId} filters={filters} setFilters={setFilters} selected={selected} setSelected={setSelected}
            leadsVersion={leadsVersion} onOpenLead={setLeadId} notify={notify} settings={settings} onOrder={setLeadOrder} followUps={followUps} />
        )}
        {view === 'analytics' && <Analytics scanId={scanId} leadsVersion={leadsVersion} onOpen={openLeads} />}
        {view === 'export' && <ExportPanel scanId={scanId} filters={filters} selected={selected} notify={notify} />}
        {view === 'outreach' && <OutreachSettings settings={settings} onSave={saveSettings} notify={notify} />}
        {view === 'settings' && <SettingsPage notify={notify} />}
      </main>

      {leadId && (
        <LeadDrawer placeId={leadId} onClose={closeLead} onChanged={bump} leadsVersion={leadsVersion} notify={notify} settings={settings}
          position={leadIndex >= 0 ? `${leadIndex + 1} of ${leadOrder.length}` : null}
          onPrev={leadIndex > 0 ? () => setLeadId(leadOrder[leadIndex - 1]) : null}
          onNext={leadIndex >= 0 && leadIndex < leadOrder.length - 1 ? () => setLeadId(leadOrder[leadIndex + 1]) : null} />
      )}

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </div>
  );
}
