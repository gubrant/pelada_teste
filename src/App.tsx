import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Home,
  LogOut,
  Radio,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { AddPlayerView } from './components/AddPlayerView';
import { FinanceView } from './components/FinanceView';
import { HomeDashboard, type AppTab } from './components/HomeDashboard';
import { LiveMatchView } from './components/LiveMatchView';
import { LoginScreen } from './components/LoginScreen';
import { PeladaHubView } from './components/PeladaHubView';
import { PeladasView } from './components/PeladasView';
import { PlayersView } from './components/PlayersView';
import type {
  AvailableUserOption,
  FinanceCategory,
  FinanceEntry,
  FinanceType,
  GroupSummary,
  MatchEventType,
  PeladaGroup,
  PeladaSession,
  PendingUserSummary,
  PlayerProfile,
  PlayerStatsSummary,
  TeamRoster,
  UserRole,
} from './types';
import { ApiError, apiFetch } from './utils/api';

const NAV_ITEMS: {
  id: AppTab;
  label: string;
  mobileLabel?: string;
  icon: typeof Home;
  adminOnly?: boolean;
}[] = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'pelada', label: 'Pelada', icon: CalendarDays },
  { id: 'live', label: 'Ao Vivo', icon: Radio },
  { id: 'players', label: 'Elenco', icon: Users },
  {
    id: 'addPlayer',
    label: 'Add Peladeiro',
    mobileLabel: 'Cadastrar',
    icon: UserPlus,
    adminOnly: true,
  },
  { id: 'finance', label: 'Caixa', icon: Wallet },
];

interface WorkspaceResponse {
  group: PeladaGroup;
  members: PlayerProfile[];
  availableUsers: AvailableUserOption[];
  finance: FinanceEntry[];
  peladas: PeladaSession[];
  stats: Record<string, PlayerStatsSummary>;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [globalUser, setGlobalUser] = useState<PlayerProfile | null>(null);

  // Hub state (first page after login: list of fixed peladas)
  const [viewMode, setViewMode] = useState<'hub' | 'workspace'>('hub');
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUserSummary[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Active pelada group workspace state
  const [activeGroup, setActiveGroup] = useState<PeladaGroup | null>(null);
  const [members, setMembers] = useState<PlayerProfile[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUserOption[]>([]);
  const [finance, setFinance] = useState<FinanceEntry[]>([]);
  const [peladas, setPeladas] = useState<PeladaSession[]>([]);
  const [stats, setStats] = useState<Record<string, PlayerStatsSummary>>({});
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedPeladaId, setSelectedPeladaId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const workspaceUser = useMemo(() => {
    if (!globalUser) return null;
    return members.find((m) => m.id === globalUser.id) || globalUser;
  }, [globalUser, members]);

  const visibleNavItems = useMemo(() => {
    const isAdmin = workspaceUser?.role === 'admin';
    return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  }, [workspaceUser?.role]);

  const adminGroups = useMemo(
    () => groups.filter((g) => g.isMember && g.myRole === 'admin'),
    [groups],
  );

  const handleLogout = useCallback(() => {
    setToken(null);
    setGlobalUser(null);
    setViewMode('hub');
    setGroups([]);
    setPendingUsers([]);
    setActiveGroup(null);
    setMembers([]);
    setAvailableUsers([]);
    setFinance([]);
    setPeladas([]);
    setStats({});
    setSelectedPeladaId(null);
    setActiveTab('home');
    setGlobalError(null);
  }, []);

  const applyWorkspace = useCallback((ws: WorkspaceResponse) => {
    setActiveGroup(ws.group);
    setMembers(ws.members);
    setAvailableUsers(ws.availableUsers);
    setFinance(ws.finance);
    setPeladas(ws.peladas);
    setStats(ws.stats);
    setSelectedPeladaId((prev) => {
      if (prev && ws.peladas.some((p) => p.id === prev)) return prev;
      return ws.peladas[0]?.id || null;
    });
  }, []);

  const loadGroupsList = useCallback(
    async (authToken: string) => {
      setLoadingGroups(true);
      setGlobalError(null);
      try {
        const [meRes, groupsRes, pendingRes] = await Promise.all([
          apiFetch<{ user: PlayerProfile }>('/api/auth/me', {}, authToken),
          apiFetch<{ groups: GroupSummary[] }>('/api/groups', {}, authToken),
          apiFetch<{ pendingUsers: PendingUserSummary[] }>(
            '/api/pending-users',
            {},
            authToken,
          ).catch(() => ({ pendingUsers: [] })),
        ]);
        setGlobalUser(meRes.user);
        setGroups(groupsRes.groups);
        setPendingUsers(pendingRes.pendingUsers);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleLogout();
        } else {
          setGlobalError(
            err instanceof Error ? err.message : 'Erro ao carregar peladas.',
          );
        }
      } finally {
        setLoadingGroups(false);
      }
    },
    [handleLogout],
  );

  const openGroupWorkspace = useCallback(
    async (groupId: string, authTokenOverride?: string) => {
      const authToken = authTokenOverride || token;
      if (!authToken) return;
      setLoadingWorkspace(true);
      setGlobalError(null);
      try {
        const ws = await apiFetch<WorkspaceResponse>(
          `/api/groups/${groupId}`,
          {},
          authToken,
        );
        applyWorkspace(ws);
        setActiveTab('home');
        setViewMode('workspace');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleLogout();
        } else {
          setGlobalError(
            err instanceof Error ? err.message : 'Erro ao abrir pelada.',
          );
        }
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [token, applyWorkspace, handleLogout],
  );

  const refreshActiveWorkspace = useCallback(async () => {
    if (!token || !activeGroup) return;
    const ws = await apiFetch<WorkspaceResponse>(
      `/api/groups/${activeGroup.id}`,
      {},
      token,
    );
    applyWorkspace(ws);
  }, [token, activeGroup, applyWorkspace]);

  // Auto-refresh active pelada workspace every 4s while viewing Ao Vivo
  useEffect(() => {
    if (!token || viewMode !== 'workspace' || activeTab !== 'live' || !activeGroup) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const ws = await apiFetch<WorkspaceResponse>(
          `/api/groups/${activeGroup.id}`,
          {},
          token,
        );
        applyWorkspace(ws);
      } catch {
        // Silent background refresh
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [token, viewMode, activeTab, activeGroup, applyWorkspace]);

  async function handleLoginSuccess(newToken: string, user: PlayerProfile) {
    setToken(newToken);
    setGlobalUser(user);
    setViewMode('hub');
    await loadGroupsList(newToken);
  }

  async function handleReturnToHub() {
    setViewMode('hub');
    setActiveGroup(null);
    setSelectedPeladaId(null);
    setActiveTab('home');
    if (token) {
      await loadGroupsList(token);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Hub actions
  async function handleCreateGroup(payload: {
    name: string;
    description: string;
    dayOfWeek: number;
    time: string;
    location: string;
    teamCount: number;
    playersPerTeam: number;
    autoSchedule: boolean;
  }) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ group: PeladaGroup }>(
      '/api/groups',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    await loadGroupsList(token);
    await openGroupWorkspace(res.group.id, token);
  }

  async function handleJoinGroup(groupId: string) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ workspace: WorkspaceResponse }>(
      `/api/groups/${groupId}/join`,
      { method: 'POST' },
      token,
    );
    applyWorkspace(res.workspace);
    setActiveTab('home');
    setViewMode('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleCreateHubPlayer(payload: Record<string, unknown>) {
    if (!token) throw new Error('Não autenticado');
    const res = await apiFetch<{ user: PlayerProfile; addedGroupIds: string[] }>(
      '/api/users',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    await loadGroupsList(token);
    return res;
  }

  async function handleApprovePendingUser(
    userId: string,
    groupIds: string[],
    role: UserRole,
  ) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch<{ user: PlayerProfile; addedGroupIds: string[] }>(
      `/api/pending-users/${userId}/approve`,
      { method: 'POST', body: JSON.stringify({ groupIds, role }) },
      token,
    );
    await loadGroupsList(token);
    if (activeGroup) {
      await refreshActiveWorkspace();
    }
  }

  async function handleRejectPendingUser(userId: string) {
    if (!token) throw new Error('Não autenticado');
    await apiFetch<{ rejectedId: string }>(
      `/api/pending-users/${userId}/reject`,
      { method: 'POST' },
      token,
    );
    await loadGroupsList(token);
  }

  async function handleUpdateGroup(payload: Record<string, unknown>) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const ws = await apiFetch<WorkspaceResponse>(
      `/api/groups/${activeGroup.id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      token,
    );
    applyWorkspace(ws);
  }

  async function handleDeleteGroup() {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    await apiFetch<{ deletedId: string }>(
      `/api/groups/${activeGroup.id}`,
      { method: 'DELETE' },
      token,
    );
    await handleReturnToHub();
  }

  // Member mutations scoped to activeGroup
  async function handleAddExistingMember(existingUserId: string, role: UserRole) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const ws = await apiFetch<WorkspaceResponse>(
      `/api/groups/${activeGroup.id}/members`,
      { method: 'POST', body: JSON.stringify({ existingUserId, role }) },
      token,
    );
    applyWorkspace(ws);
  }

  async function handleCreatePlayer(payload: Record<string, unknown>) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const ws = await apiFetch<WorkspaceResponse>(
      `/api/groups/${activeGroup.id}/members`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    applyWorkspace(ws);
  }

  async function handleUpdatePlayer(id: string, payload: Record<string, unknown>) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const ws = await apiFetch<WorkspaceResponse>(
      `/api/groups/${activeGroup.id}/members/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      token,
    );
    applyWorkspace(ws);
    if (globalUser?.id === id) {
      const me = await apiFetch<{ user: PlayerProfile }>('/api/auth/me', {}, token);
      setGlobalUser(me.user);
    }
  }

  async function handleDeletePlayer(id: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const ws = await apiFetch<WorkspaceResponse>(
      `/api/groups/${activeGroup.id}/members/${id}`,
      { method: 'DELETE' },
      token,
    );
    applyWorkspace(ws);
  }

  // Finance mutations scoped to activeGroup
  async function handleCreateFinance(payload: {
    type: FinanceType;
    date: string;
    description: string;
    category: FinanceCategory;
    amount: number;
    receiptUrl?: string;
  }) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ entry: FinanceEntry }>(
      `/api/groups/${activeGroup.id}/finance`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setFinance((prev) => [res.entry, ...prev]);
  }

  async function handleDeleteFinance(id: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    await apiFetch<{ deletedId: string }>(
      `/api/groups/${activeGroup.id}/finance/${id}`,
      { method: 'DELETE' },
      token,
    );
    setFinance((prev) => prev.filter((f) => f.id !== id));
  }

  // Match session mutations scoped to activeGroup
  async function handleCreatePelada(payload: {
    title: string;
    date: string;
    time: string;
    scheduledAt?: string;
    location: string;
    teamCount: number;
    playersPerTeam: number;
    presentPlayerIds: string[];
  }) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    await refreshActiveWorkspace();
    return res.pelada;
  }

  async function handleDeletePelada(id: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    await apiFetch<{ deletedId: string }>(
      `/api/groups/${activeGroup.id}/peladas/${id}`,
      { method: 'DELETE' },
      token,
    );
    await refreshActiveWorkspace();
  }

  async function handleCancelPelada(id: string, reason?: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${id}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === id ? res.pelada : p)));
  }

  async function handleReactivatePelada(id: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${id}/reactivate`,
      { method: 'POST' },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === id ? res.pelada : p)));
  }

  async function handleToggleAttendance(peladaId: string, playerId?: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/attendance`,
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
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/draw-teams`,
      { method: 'POST', body: JSON.stringify({ teamCount, playersPerTeam }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
  }

  async function handleUpdateTeams(peladaId: string, teams: TeamRoster[]) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/teams`,
      { method: 'PUT', body: JSON.stringify({ teams }) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
  }

  async function handleLiveControl(
    peladaId: string,
    payload: Record<string, unknown>,
  ) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/live/control`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    await refreshActiveWorkspace();
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
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/live/event`,
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    await refreshActiveWorkspace();
  }

  async function handleDeleteLiveEvent(peladaId: string, eventId: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{ pelada: PeladaSession }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/live/event/${eventId}`,
      { method: 'DELETE' },
      token,
    );
    setPeladas((prev) => prev.map((p) => (p.id === peladaId ? res.pelada : p)));
    await refreshActiveWorkspace();
  }

  async function handleCastVote(peladaId: string, targetPlayerId: string) {
    if (!token || !activeGroup) throw new Error('Não autenticado');
    const res = await apiFetch<{
      pelada: PeladaSession;
      stats: Record<string, PlayerStatsSummary>;
    }>(
      `/api/groups/${activeGroup.id}/peladas/${peladaId}/vote`,
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

  if (!token || !globalUser || !workspaceUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#F6F8F7] text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Back to Hub (when in workspace) or Wordmark */}
          <div className="flex items-center gap-3 min-w-0">
            {viewMode === 'workspace' ? (
              <button
                type="button"
                onClick={handleReturnToHub}
                className="min-h-[40px] px-2.5 -ml-2 rounded-xl hover:bg-slate-100 text-slate-800 inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-700" />
                <span>Peladas</span>
              </button>
            ) : (
              <span className="text-lg sm:text-xl font-display font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
                QuadraLivre
              </span>
            )}

            {viewMode === 'workspace' && activeGroup && (
              <span className="hidden sm:inline text-sm font-display font-bold text-slate-900 truncate max-w-[200px] lg:max-w-[260px]">
                {activeGroup.name}
              </span>
            )}
          </div>

          {/* Zone 2: Single-line nav links when inside a Pelada workspace */}
          {viewMode === 'workspace' && activeGroup ? (
            <nav
              aria-label="Navegação da pelada"
              className="hidden md:flex items-center gap-4 lg:gap-6"
            >
              {visibleNavItems.map((item) => {
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
          ) : (
            <p className="hidden sm:block text-xs font-medium text-slate-500">
              Escolha ou crie uma pelada fixa
            </p>
          )}

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
      <main
        className={`flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 ${
          viewMode === 'workspace' ? 'pb-24 md:pb-12' : 'pb-12'
        }`}
      >
        {globalError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {globalError}
          </div>
        )}

        {viewMode === 'hub' ? (
          loadingGroups && groups.length === 0 ? (
            <div className="space-y-4">
              <div className="h-36 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-52 rounded-2xl bg-slate-200 animate-pulse" />
                <div className="h-52 rounded-2xl bg-slate-200 animate-pulse" />
              </div>
            </div>
          ) : (
            <PeladaHubView
              currentUser={globalUser}
              groups={groups}
              pendingUsers={pendingUsers}
              onOpenGroup={(gid) => openGroupWorkspace(gid)}
              onJoinGroup={handleJoinGroup}
              onCreateGroup={handleCreateGroup}
              onCreateHubPlayer={handleCreateHubPlayer}
              onApprovePendingUser={handleApprovePendingUser}
              onRejectPendingUser={handleRejectPendingUser}
            />
          )
        ) : loadingWorkspace && !activeGroup ? (
          <div className="space-y-4">
            <div className="h-56 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
            </div>
          </div>
        ) : activeGroup ? (
          <>
            {activeTab === 'home' && (
              <HomeDashboard
                activeGroup={activeGroup}
                currentUser={workspaceUser}
                players={members}
                peladas={peladas}
                finance={finance}
                stats={stats}
                onNavigate={navigateTo}
                onToggleAttendance={(pid) => handleToggleAttendance(pid)}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
              />
            )}

            {activeTab === 'pelada' && (
              <PeladasView
                activeGroup={activeGroup}
                currentUser={workspaceUser}
                players={members}
                peladas={peladas}
                selectedPeladaId={selectedPeladaId}
                onSelectPelada={setSelectedPeladaId}
                onCreatePelada={handleCreatePelada}
                onDeletePelada={handleDeletePelada}
                onCancelPelada={handleCancelPelada}
                onReactivatePelada={handleReactivatePelada}
                onToggleAttendance={handleToggleAttendance}
                onDrawTeams={handleDrawTeams}
                onUpdateTeams={handleUpdateTeams}
                onCastVote={handleCastVote}
                onOpenLive={(pid) => navigateTo('live', pid)}
              />
            )}

            {activeTab === 'live' && (
              <LiveMatchView
                currentUser={workspaceUser}
                players={members}
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
                currentUser={workspaceUser}
                groupName={activeGroup.name}
                players={members}
                availableUsers={availableUsers}
                stats={stats}
                onAddExistingMember={handleAddExistingMember}
                onCreatePlayer={handleCreatePlayer}
                onUpdatePlayer={handleUpdatePlayer}
                onDeletePlayer={handleDeletePlayer}
              />
            )}

            {activeTab === 'addPlayer' && workspaceUser.role === 'admin' && (
              <AddPlayerView
                groupId={activeGroup.id}
                groupName={activeGroup.name}
                availableUsers={availableUsers}
                pendingUsers={pendingUsers}
                adminGroups={adminGroups}
                onCreatePlayer={handleCreatePlayer}
                onAddExistingMember={handleAddExistingMember}
                onApprovePendingUser={handleApprovePendingUser}
                onRejectPendingUser={handleRejectPendingUser}
                onGoToRoster={() => navigateTo('players')}
              />
            )}

            {activeTab === 'finance' && (
              <FinanceView
                currentUser={workspaceUser}
                entries={finance}
                onCreateEntry={handleCreateFinance}
                onDeleteEntry={handleDeleteFinance}
              />
            )}
          </>
        ) : null}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (only inside a Pelada workspace) */}
      {viewMode === 'workspace' && activeGroup && (
        <nav
          aria-label="Menu rápido celular"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        >
          <div
            className={`grid h-16 ${
              visibleNavItems.length === 6 ? 'grid-cols-6' : 'grid-cols-5'
            }`}
          >
            {visibleNavItems.map((item) => {
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
                  <span className="text-[10px] sm:text-[11px] font-semibold tracking-tight whitespace-nowrap">
                    {item.mobileLabel || item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
