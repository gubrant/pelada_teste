import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Home,
  LogOut,
  Radio,
  Users,
  Wallet,
} from 'lucide-react';
import { FinanceView } from './components/FinanceView';
import { HomeDashboard, type AppTab } from './components/HomeDashboard';
import { LiveMatchView } from './components/LiveMatchView';
import { LoginScreen } from './components/LoginScreen';
import { PeladasView } from './components/PeladasView';
import { PlayersView } from './components/PlayersView';
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceType,
  MatchEventType,
  PeladaSession,
  PlayerProfile,
  PlayerStatsSummary,
  RecurringPeladaRule,
  TeamRoster,
} from './types';
import { ApiError, apiFetch } from './utils/api';

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'pelada', label: 'Pelada', icon: CalendarDays },
  { id: 'live', label: 'Ao Vivo', icon: Radio },
  { id: 'players', label: 'Elenco', icon: Users },
  { id: 'finance', label: 'Caixa', icon: Wallet },
];

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<PlayerProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedPeladaId, setSelectedPeladaId] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [finance, setFinance] = useState<FinanceEntry[]>([]);
  const [peladas, setPeladas] = useState<PeladaSession[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringPeladaRule[]>([]);
  const [stats, setStats] = useState<Record<string, PlayerStatsSummary>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
    setPlayers([]);
    setFinance([]);
    setPeladas([]);
    setRecurringRules([]);
    setStats({});
    setSelectedPeladaId(null);
    setActiveTab('home');
    setGlobalError(null);
  }, []);

  const loadAllData = useCallback(
    async (authToken: string) => {
      setLoadingData(true);
      setGlobalError(null);
      try {
        const [meRes, playersRes, financeRes, peladasRes] = await Promise.all([
          apiFetch<{ user: PlayerProfile }>('/api/auth/me', {}, authToken),
          apiFetch<{ players: PlayerProfile[] }>('/api/players', {}, authToken),
          apiFetch<{ entries: FinanceEntry[] }>('/api/finance', {}, authToken),
          apiFetch<{
            peladas: PeladaSession[];
            stats: Record<string, PlayerStatsSummary>;
            recurringRules: RecurringPeladaRule[];
          }>('/api/peladas', {}, authToken),
        ]);

        setCurrentUser(meRes.user);
        setPlayers(playersRes.players);
        setFinance(financeRes.entries);
        setPeladas(peladasRes.peladas);
        setRecurringRules(peladasRes.recurringRules || []);
        setStats(peladasRes.stats);
        setSelectedPeladaId((prev) => {
          if (prev && peladasRes.peladas.some((p) => p.id === prev)) return prev;
          return peladasRes.peladas[0]?.id || null;
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleLogout();
        } else {
          setGlobalError(
            err instanceof Error ? err.message : 'Erro ao carregar dados.',
          );
        }
      } finally {
        setLoadingData(false);
      }
    },
    [handleLogout],
  );

  // Auto-refresh pelada state every 4s while viewing the Live tab
  useEffect(() => {
    if (!token || activeTab !== 'live') return;
    const interval = window.setInterval(async () => {
      try {
        const res = await apiFetch<{
          peladas: PeladaSession[];
          stats: Record<string, PlayerStatsSummary>;
          recurringRules: RecurringPeladaRule[];
        }>('/api/peladas', {}, token);
        setPeladas(res.peladas);
        setRecurringRules(res.recurringRules || []);
        setStats(res.stats);
      } catch {
        // Silent background refresh
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [token, activeTab]);

  async function refreshPeladasAndStats() {
    if (!token) return;
    const res = await apiFetch<{
      peladas: PeladaSession[];
      stats: Record<string, PlayerStatsSummary>;
      recurringRules: RecurringPeladaRule[];
    }>('/api/peladas', {}, token);
    setPeladas(res.peladas);
    setRecurringRules(res.recurringRules || []);
    setStats(res.stats);
  }

  async function handleLoginSuccess(newToken: string, user: PlayerProfile) {
    setToken(newToken);
    setCurrentUser(user);
    await loadAllData(newToken);
  }

  // Player mutations
  async function handleCreatePlayer(payload: Record<string, unknown>) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ player: PlayerProfile }>(
      '/api/players',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setPlayers((prev) => [...prev, res.player]);
    return res.player;
  }

  async function handleUpdatePlayer(id: string, payload: Record<string, unknown>) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ player: PlayerProfile }>(
      `/api/players/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      token,
    );
    setPlayers((prev) => prev.map((p) => (p.id === id ? res.player : p)));
    if (currentUser?.id === id) {
      setCurrentUser(res.player);
    }
    return res.player;
  }

  async function handleDeletePlayer(id: string) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch<{ deletedId: string }>(
      `/api/players/${id}`,
      { method: 'DELETE' },
      token,
    );
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    await refreshPeladasAndStats();
  }

  // Finance mutations
  async function handleCreateFinance(payload: {
    type: FinanceType;
    date: string;
    description: string;
    category: FinanceCategory;
    amount: number;
    receiptUrl?: string;
  }) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ entry: FinanceEntry }>(
      '/api/finance',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setFinance((prev) => [res.entry, ...prev]);
  }

  async function handleDeleteFinance(id: string) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch<{ deletedId: string }>(
      `/api/finance/${id}`,
      { method: 'DELETE' },
      token,
    );
    setFinance((prev) => prev.filter((f) => f.id !== id));
  }

  // Pelada mutations
  async function handleCreatePelada(payload: {
    title: string;
    date: string;
    time: string;
    scheduledAt?: string;
    location: string;
    teamCount: number;
    playersPerTeam: number;
    presentPlayerIds: string[];
    isRecurring?: boolean;
  }) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      '/api/peladas',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    await refreshPeladasAndStats();
    return res.pelada;
  }

  async function handleDeletePelada(id: string) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch<{ deletedId: string }>(
      `/api/peladas/${id}`,
      { method: 'DELETE' },
      token,
    );
    await refreshPeladasAndStats();
  }

  async function handleCancelPelada(id: string, reason?: string) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${id}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === id ? res.pelada : p)));
  }

  async function handleReactivatePelada(id: string) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${id}/reactivate`,
      { method: 'POST' },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === id ? res.pelada : p)));
  }

  async function handleToggleRecurringRule(id: string, active: boolean) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch(
      `/api/peladas/recurring/${id}`,
      { method: 'PUT', body: JSON.stringify({ active }) },
      token,
    );
    await refreshPeladasAndStats();
  }

  async function handleDeleteRecurringRule(id: string) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch(
      `/api/peladas/recurring/${id}`,
      { method: 'DELETE' },
      token,
    );
    await refreshPeladasAndStats();
  }

  async function handleToggleAttendance(peladaId: string, playerId?: string) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${peladaId}/attendance`,
      { method: 'POST', body: JSON.stringify(playerId ? { playerId } : {}) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
  }

  async function handleDrawTeams(
    peladaId: string,
    teamCount: number,
    playersPerTeam: number,
  ) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${peladaId}/draw-teams`,
      { method: 'POST', body: JSON.stringify({ teamCount, playersPerTeam }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
  }

  async function handleUpdateTeams(peladaId: string, teams: TeamRoster[]) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${peladaId}/teams`,
      { method: 'PUT', body: JSON.stringify({ teams }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
  }

  async function handleLiveControl(
    peladaId: string,
    payload: Record<string, unknown>,
  ) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${peladaId}/live/control`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    await refreshPeladasAndStats();
  }

  async function handleAddLiveEvent(
    peladaId: string,
    payload: {
      type: MatchEventType;
      teamId: string;
      playerId: string;
      assistPlayerId?: string;
    },
  ) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${peladaId}/live/event`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    await refreshPeladasAndStats();
  }

  async function handleDeleteLiveEvent(peladaId: string, eventId: string) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/peladas/${peladaId}/live/event/${eventId}`,
      { method: 'DELETE' },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    await refreshPeladasAndStats();
  }

  async function handleCastVote(peladaId: string, targetPlayerId: string) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{
      pelada: PeladaSession;
      stats: Record<string, PlayerStatsSummary>;
    }>(
      `/api/peladas/${peladaId}/vote`,
      { method: 'POST', body: JSON.stringify({ targetPlayerId }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    setStats(res.stats);
  }

  function navigateTo(tab: AppTab, peladaId?: string) {
    if (peladaId) setSelectedPeladaId(peladaId);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!token || !currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#F6F8F7] text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract (Desktop) & Compact Top App Bar (Mobile) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="text-lg sm:text-xl font-display font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            QuadraLivre
          </button>

          {/* Zone 2: 5 single-line nav links on desktop */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`min-h-[40px] px-1 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-emerald-700 text-emerald-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 pb-24 md:pb-12">
        {globalError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {globalError}
          </div>
        )}

        {loadingData && players.length === 0 ? (
          <div className="space-y-4">
            <div className="h-56 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeDashboard
                currentUser={currentUser}
                players={players}
                peladas={peladas}
                finance={finance}
                stats={stats}
                onNavigate={navigateTo}
                onToggleAttendance={(pid) => handleToggleAttendance(pid)}
              />
            )}

            {activeTab === 'pelada' && (
              <PeladasView
                currentUser={currentUser}
                players={players}
                peladas={peladas}
                recurringRules={recurringRules}
                selectedPeladaId={selectedPeladaId}
                onSelectPelada={setSelectedPeladaId}
                onCreatePelada={handleCreatePelada}
                onDeletePelada={handleDeletePelada}
                onCancelPelada={handleCancelPelada}
                onReactivatePelada={handleReactivatePelada}
                onToggleRecurringRule={handleToggleRecurringRule}
                onDeleteRecurringRule={handleDeleteRecurringRule}
                onToggleAttendance={handleToggleAttendance}
                onDrawTeams={handleDrawTeams}
                onUpdateTeams={handleUpdateTeams}
                onCastVote={handleCastVote}
                onOpenLive={(pid) => navigateTo('live', pid)}
              />
            )}

            {activeTab === 'live' && (
              <LiveMatchView
                currentUser={currentUser}
                players={players}
                peladas={peladas}
                selectedPeladaId={selectedPeladaId}
                onSelectPelada={setSelectedPeladaId}
                onLiveControl={handleLiveControl}
                onAddEvent={handleAddLiveEvent}
                onDeleteEvent={handleDeleteLiveEvent}
                onFinishAndVote={(pid) => navigateTo('pelada', pid)}
              />
            )}

            {activeTab === 'players' && (
              <PlayersView
                currentUser={currentUser}
                players={players}
                stats={stats}
                onCreatePlayer={handleCreatePlayer}
                onUpdatePlayer={handleUpdatePlayer}
                onDeletePlayer={handleDeletePlayer}
              />
            )}

            {activeTab === 'finance' && (
              <FinanceView
                currentUser={currentUser}
                entries={finance}
                onCreateEntry={handleCreateFinance}
                onDeleteEntry={handleDeleteFinance}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb-Zone Navigation) */}
      <nav
        aria-label="Menu rápido celular"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 1.9} />
                <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
