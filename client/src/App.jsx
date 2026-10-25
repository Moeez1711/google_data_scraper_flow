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
  ['configure', '01', 'Search Setup', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )],
  ['scanner', '02', 'Live Scanner', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )],
  ['leads', '03', 'Lead Results', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )],
  ['analytics', '04', 'Analytics', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )],
  ['export', '05', 'Export', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )],
  ['outreach', '06', 'Outreach', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )],
  ['settings', '07', 'Settings & Quota', (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )],
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

  const loadInitialData = useCallback(() => {
    setServerError(null);
    api.get('/meta').then((m) => { setMeta(m); setServerError(null); }).catch((e) => setServerError(e.message));
    api.get('/settings').then((s) => setSettings(mergeSettings(s))).catch(() => {});
    refreshScans().then((list) => {
      const pick = list.find((s) => s.active) || list[0];
      if (pick) { setScanId(pick.id); if (!INITIAL_VIEW) setView(pick.active ? 'scanner' : 'leads'); }
    }).catch(() => {});
  }, [refreshScans]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

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
          <div className="brand-mark bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 shadow-md shadow-emerald-500/25">
            <svg className="size-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3v6m0 6v6M3 12h6m6 0h6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <b className="text-[15px] font-bold text-white tracking-tight">Lead Scout</b>
              <span className="rounded bg-gradient-to-r from-emerald-500 to-teal-500 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase text-white shadow-2xs">SaaS</span>
            </div>
            <small className="text-[11px] text-slate-400">Local Intelligence</small>
          </div>
        </div>
        <nav>
          {NAV.map(([id, n, label, icon]) => (
            <button key={id} className={`group ${view === id ? 'on' : ''}`} onClick={() => setView(id)}>
              <span className={`transition-colors ${view === id ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                {icon}
              </span>
              <span className="grow font-medium">{label}</span>
              <span className="nav-n">{n}</span>
              {id === 'scanner' && scan?.active && <span className="pulse ml-1" />}
              {id === 'leads' && followUps.due > 0 && (
                <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] leading-[17px] font-bold text-white shadow-sm" title="Follow-ups due today">{followUps.due}</span>
              )}
            </button>
          ))}
        </nav>
        {scan && (
          <button className="rail-scan" onClick={() => setView('scanner')}>
            <div className="flex items-center justify-between gap-1">
              <small className="font-mono text-[11px] text-emerald-400/90 font-semibold">Active Scan #{scan.id}</small>
              <StatusChip status={scan.active ? 'running' : scan.status} />
            </div>
            <b className="text-white text-xs font-semibold truncate">{scan.config.categoryLabel}</b>
            <span className="text-[11.5px] text-slate-400 truncate">{scan.config.area}, {scan.config.country}</span>
          </button>
        )}
        <div className="rail-foot">
          <span className={`conn ${live ? 'ok' : ''}`} />
          <span className="text-[11.5px] font-medium">{live ? 'Live Engine Active' : 'Connecting to API…'}</span>
        </div>
      </aside>
      <main className="main">
        {serverError && (
          <div className="banner error flex items-center justify-between gap-3">
            <div>
              Cannot reach the API server ({serverError}).
              <span className="opacity-80 ml-1">If Render is waking up from sleep, this can take 30–50 seconds.</span>
            </div>
            <button
              onClick={loadInitialData}
              className="ml-auto px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-xs font-semibold cursor-pointer shrink-0"
            >
              Retry Connection
            </button>
          </div>
        )}
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
