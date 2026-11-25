import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  MapPin,
  Radio,
  Settings,
  Trash2,
  Trophy,
  Users,
  Vote,
  Wallet,
  X,
} from 'lucide-react';
import type {
  FinanceEntry,
  PeladaGroup,
  PeladaSession,
  PlayerProfile,
  PlayerStatsSummary,
} from '../types';
import { formatBRL, formatDateBR } from '../utils/api';
import {
  WEEKDAY_NAMES,
  formatDeadlineCountdown,
  formatTimeFromMs,
  getAttendanceDeadlineMs,
} from '../utils/peladaTime';
import { PlayerAvatar } from './PlayerAvatar';

export type AppTab = 'home' | 'pelada' | 'live' | 'players' | 'finance';

interface HomeDashboardProps {
  activeGroup: PeladaGroup;
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  peladas: PeladaSession[];
  finance: FinanceEntry[];
  stats: Record<string, PlayerStatsSummary>;
  onNavigate: (tab: AppTab, peladaId?: string) => void;
  onToggleAttendance: (peladaId: string) => Promise<void>;
  onUpdateGroup: (payload: Record<string, unknown>) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
}

export function HomeDashboard({
  activeGroup,
  currentUser,
  players,
  peladas,
  finance,
  stats,
  onNavigate,
  onToggleAttendance,
  onUpdateGroup,
  onDeleteGroup,
}: HomeDashboardProps) {
  const isAdmin = currentUser.role === 'admin';
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [togglingAttendance, setTogglingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Settings modal for fixed pelada
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [groupName, setGroupName] = useState(activeGroup.name);
  const [groupDesc, setGroupDesc] = useState(activeGroup.description);
  const [groupDow, setGroupDow] = useState(activeGroup.dayOfWeek);
  const [groupTime, setGroupTime] = useState(activeGroup.time);
  const [groupLocation, setGroupLocation] = useState(activeGroup.location);
  const [groupTeamCount, setGroupTeamCount] = useState(activeGroup.teamCount);
  const [groupPlayersPerTeam, setGroupPlayersPerTeam] = useState(
    activeGroup.playersPerTeam || 5,
  );
  const [groupAutoSchedule, setGroupAutoSchedule] = useState(
    activeGroup.autoSchedule,
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const activePlayers = players.filter((p) => p.active);
  const nextPelada =
    peladas.find((p) => p.status === 'live') ||
    peladas.find((p) => p.status === 'scheduled') ||
    peladas.find((p) => p.status !== 'cancelled') ||
    peladas[0];

  const completedWithVoting = peladas.find((p) => p.status === 'completed');

  const totalBalance = finance.reduce(
    (acc, entry) => (entry.type === 'income' ? acc + entry.amount : acc - entry.amount),
    0,
  );

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthEntries = finance.filter((f) => f.date.startsWith(currentMonth));
  const monthIncome = monthEntries
    .filter((f) => f.type === 'income')
    .reduce((acc, f) => acc + f.amount, 0);
  const monthExpense = monthEntries
    .filter((f) => f.type === 'expense')
    .reduce((acc, f) => acc + f.amount, 0);

  const rankedScorers = [...activePlayers]
    .sort((a, b) => {
      const sa = stats[a.id];
      const sb = stats[b.id];
      const scoreA = (sa?.goals || 0) * 2 + (sa?.assists || 0);
      const scoreB = (sb?.goals || 0) * 2 + (sb?.assists || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.finalRating - a.finalRating;
    })
    .slice(0, 5);

  const topScorer = rankedScorers[0];
  const topScorerGoals = topScorer ? stats[topScorer.id]?.goals || 0 : 0;

  const isAttendingNext = nextPelada
    ? nextPelada.presentPlayerIds.includes(currentUser.id)
    : false;

  const deadlineMs = nextPelada ? getAttendanceDeadlineMs(nextPelada) : 0;
  const deadlinePassed = nextPelada ? Date.now() > deadlineMs : false;
  const canSelfToggle =
    Boolean(nextPelada) &&
    nextPelada?.status === 'scheduled' &&
    (!deadlinePassed || isAdmin);

  function openSettings() {
    setGroupName(activeGroup.name);
    setGroupDesc(activeGroup.description);
    setGroupDow(activeGroup.dayOfWeek);
    setGroupTime(activeGroup.time);
    setGroupLocation(activeGroup.location);
    setGroupTeamCount(activeGroup.teamCount);
    setGroupPlayersPerTeam(activeGroup.playersPerTeam || 5);
    setGroupAutoSchedule(activeGroup.autoSchedule);
    setConfirmDeleteGroup(false);
    setSettingsError(null);
    setShowSettingsModal(true);
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    setSavingSettings(true);
    try {
      await onUpdateGroup({
        name: groupName.trim(),
        description: groupDesc.trim(),
        dayOfWeek: groupDow,
        time: groupTime,
        location: groupLocation.trim(),
        teamCount: groupTeamCount,
        playersPerTeam: groupPlayersPerTeam,
        autoSchedule: groupAutoSchedule,
      });
      setShowSettingsModal(false);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Erro ao atualizar pelada fixa.',
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleToggleSelfAttendance() {
    if (!nextPelada || togglingAttendance || !canSelfToggle) return;
    setTogglingAttendance(true);
    setAttendanceError(null);
    try {
      await onToggleAttendance(nextPelada.id);
    } catch (err) {
      setAttendanceError(
        err instanceof Error ? err.message : 'Não foi possível confirmar presença.',
      );
    } finally {
      setTogglingAttendance(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Group Info Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Toda {WEEKDAY_NAMES[activeGroup.dayOfWeek]} às{' '}
            <span className="font-mono tabular-nums">{activeGroup.time}</span> ·{' '}
            <span className="font-mono tabular-nums">
              {activeGroup.teamCount}×{activeGroup.playersPerTeam || 5}
            </span>{' '}
            · Seu papel: {isAdmin ? 'Administrador' : 'Peladeiro'}
          </p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">
            {activeGroup.name}
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openSettings}
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>Configurar Pelada Fixa</span>
          </button>
        )}
      </div>

      {/* Focal Hero Banner: Próxima Pelada / Ao Vivo */}
      <section className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 min-h-[240px] flex flex-col justify-end">
        {!heroImgFailed ? (
          <img
            src="/src/assets/images/futsal_court_hero_1795567439483.jpg"
            alt="Quadra da pelada"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-950/30" />

        <div className="relative z-10 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-300 mb-2">
              <span>
                {nextPelada?.status === 'live'
                  ? 'Partida em andamento'
                  : nextPelada?.status === 'scheduled'
                    ? 'Próxima pelada agendada'
                    : nextPelada?.status === 'cancelled'
                      ? 'Pelada cancelada'
                      : 'Resumo da última pelada'}
              </span>
              {nextPelada && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatDateBR(nextPelada.date)} às {nextPelada.time}
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-white tracking-tight text-balance">
              {nextPelada ? nextPelada.title : activeGroup.name}
            </h1>

            {nextPelada && (
              <div className="mt-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-200">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{nextPelada.location}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{nextPelada.presentPlayerIds.length} confirmados</span>
                  </span>
                </div>

                {nextPelada.status === 'scheduled' && (
                  <p className="text-xs text-amber-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {deadlinePassed
                        ? 'Prazo encerrado (1h antes do jogo) — lista pronta para o sorteio dos times.'
                        : `Confirme presença até 1h antes do jogo (até ${formatTimeFromMs(deadlineMs)} · ${formatDeadlineCountdown(deadlineMs)}) para entrar no sorteio.`}
                    </span>
                  </p>
                )}

                {attendanceError && (
                  <p className="text-xs text-red-300">{attendanceError}</p>
                )}
              </div>
            )}
          </div>

          {nextPelada && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {nextPelada.status === 'scheduled' && (
                <button
                  type="button"
                  onClick={handleToggleSelfAttendance}
                  disabled={togglingAttendance || !canSelfToggle}
                  className={`min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    !canSelfToggle
                      ? 'bg-slate-800/80 text-slate-400 cursor-not-allowed'
                      : isAttendingNext
                        ? 'bg-white text-slate-900 hover:bg-slate-100 cursor-pointer'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {!canSelfToggle
                      ? 'Confirmação encerrada'
                      : isAttendingNext
                        ? 'Presença confirmada'
                        : 'Confirmar presença'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    nextPelada.status === 'live' ? 'live' : 'pelada',
                    nextPelada.id,
                  )
                }
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {nextPelada.status === 'live' ? (
                  <>
                    <Radio className="w-4 h-4" />
                    <span>Abrir placar ao vivo</span>
                  </>
                ) : (
                  <>
                    <span>Times e convocados</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('finance')}
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Saldo em Caixa</span>
            <Wallet className="w-4 h-4 text-emerald-700" />
          </div>
          <p
            className={`mt-2 text-xl sm:text-2xl font-display font-bold font-mono tabular-nums ${
              totalBalance >= 0 ? 'text-slate-900' : 'text-red-700'
            }`}
          >
            {formatBRL(totalBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            +{formatBRL(monthIncome)} este mês
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('players')}
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Elenco Ativo</span>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-display font-bold font-mono tabular-nums text-slate-900">
            {activePlayers.length} atletas
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {activePlayers.filter((p) => p.preferredPosition === 'Goleiro').length} goleiros
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('players')}
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Artilheiro</span>
            <Trophy className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-display font-bold text-slate-900 truncate">
            {topScorer ? topScorer.name.split(' ')[0] : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {topScorerGoals} {topScorerGoals === 1 ? 'gol marcado' : 'gols marcados'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('pelada', completedWithVoting?.id)}
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Votação Craque</span>
            <Vote className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-display font-bold font-mono tabular-nums text-slate-900">
            {completedWithVoting ? `${completedWithVoting.votes.length} votos` : 'Aguardando'}
          </p>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {completedWithVoting ? completedWithVoting.title : 'Sem jogo concluído'}
          </p>
        </button>
      </section>

      {/* Two-column body: Artilharia & Finanças */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900">
                Destaques da Pelada
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ranking individual exclusivo desta pelada fixa
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('players')}
              className="min-h-[40px] px-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ver elenco completo
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {rankedScorers.map((player, index) => {
              const st = stats[player.id];
              return (
                <div
                  key={player.id}
                  className="py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-xs font-mono tabular-nums font-semibold text-slate-400">
                      0{index + 1}
                    </span>
                    <PlayerAvatar
                      name={player.name}
                      src={player.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {player.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {player.preferredPosition} · Nota{' '}
                        <span className="font-mono tabular-nums font-medium text-slate-700">
                          {player.finalRating.toFixed(1)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-right font-mono tabular-nums text-xs">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {st?.goals || 0}
                      </p>
                      <p className="text-[11px] text-slate-500">Gols</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {st?.assists || 0}
                      </p>
                      <p className="text-[11px] text-slate-500">Assist.</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {st?.saves || 0}
                      </p>
                      <p className="text-[11px] text-slate-500">Defesas</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* Balanço Mensal Rápido */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-display font-bold text-slate-900">
                Resumo do Mês
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="min-h-[40px] px-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Abrir caixa
              </button>
            </div>

            <div className="mt-4 space-y-3 font-mono tabular-nums">
              <div className="flex items-center justify-between text-sm">
                <span className="font-sans text-slate-600">Entradas do mês</span>
                <span className="font-semibold text-emerald-700">
                  +{formatBRL(monthIncome)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-sans text-slate-600">Saídas do mês</span>
                <span className="font-semibold text-red-700">
                  -{formatBRL(monthExpense)}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
                <span className="font-sans font-semibold text-slate-900">
                  Resultado mensal
                </span>
                <span
                  className={`font-bold ${
                    monthIncome - monthExpense >= 0
                      ? 'text-slate-900'
                      : 'text-red-700'
                  }`}
                >
                  {formatBRL(monthIncome - monthExpense)}
                </span>
              </div>
            </div>
          </div>

          {/* Sua Ficha Rápida */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <PlayerAvatar
                name={currentUser.name}
                src={currentUser.avatarUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-display font-bold text-slate-900 truncate">
                  {currentUser.name}
                </p>
                <p className="text-xs text-slate-500">
                  @{currentUser.username} ·{' '}
                  {currentUser.role === 'admin' ? 'Administrador' : 'Peladeiro'} ·{' '}
                  {currentUser.preferredPosition}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-display font-bold font-mono tabular-nums text-emerald-700">
                  {currentUser.finalRating.toFixed(1)}
                </p>
                <p className="text-[11px] text-slate-500">Nota nesta pelada</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Tipo Sanguíneo: {currentUser.health.bloodType}</span>
              </span>
              <button
                type="button"
                onClick={() => onNavigate('players')}
                className="font-semibold text-emerald-700 hover:text-emerald-800 min-h-[36px] px-2 cursor-pointer"
              >
                Editar minha ficha
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Modal: Configurar Pelada Fixa */}
      {showSettingsModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-display font-bold text-slate-900">
                Configurações da Pelada Fixa
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setShowSettingsModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome da pelada fixa
                </label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Dia da semana
                  </label>
                  <select
                    value={groupDow}
                    onChange={(e) => setGroupDow(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                  >
                    {WEEKDAY_NAMES.map((label, idx) => (
                      <option key={label} value={idx}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Horário
                  </label>
                  <input
                    type="time"
                    required
                    value={groupTime}
                    onChange={(e) => setGroupTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Local / Quadra
                </label>
                <input
                  type="text"
                  required
                  value={groupLocation}
                  onChange={(e) => setGroupLocation(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantidade de times
                  </label>
                  <select
                    value={groupTeamCount}
                    onChange={(e) => setGroupTeamCount(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                  >
                    {[2, 3, 4, 5, 6].map((cnt) => (
                      <option key={cnt} value={cnt}>
                        {cnt} Times
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Atletas por time
                  </label>
                  <select
                    value={groupPlayersPerTeam}
                    onChange={(e) => setGroupPlayersPerTeam(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                  >
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>
                        {num} atletas
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupAutoSchedule}
                  onChange={(e) => setGroupAutoSchedule(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-700"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Agendamento automático semanal
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Gera automaticamente a próxima partida no dia e horário fixos.
                  </p>
                </div>
              </label>

              {settingsError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                  {settingsError}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                {confirmDeleteGroup ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onDeleteGroup}
                      className="min-h-[40px] px-3 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteGroup(false)}
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGroup(true)}
                    className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir pelada fixa</span>
                  </button>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingSettings ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
