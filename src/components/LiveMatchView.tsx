import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Undo2,
  X,
} from 'lucide-react';
import type { MatchEventType, PeladaSession, PlayerProfile } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

interface LiveMatchViewProps {
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  peladas: PeladaSession[];
  selectedPeladaId: string | null;
  onSelectPelada: (id: string) => void;
  onLiveControl: (
    peladaId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onAddEvent: (
    peladaId: string,
    payload: {
      type: MatchEventType;
      teamId: string;
      playerId: string;
      assistPlayerId?: string;
    },
  ) => Promise<void>;
  onDeleteEvent: (peladaId: string, eventId: string) => Promise<void>;
  onFinishAndVote: (peladaId: string) => void;
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LiveMatchView({
  currentUser,
  players,
  peladas,
  selectedPeladaId,
  onSelectPelada,
  onLiveControl,
  onAddEvent,
  onDeleteEvent,
  onFinishAndVote,
}: LiveMatchViewProps) {
  const isAdmin = currentUser.role === 'admin';
  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const activePelada =
    peladas.find((p) => p.id === selectedPeladaId) ||
    peladas.find((p) => p.status === 'live') ||
    peladas.find((p) => p.status === 'scheduled') ||
    peladas.find((p) => p.status !== 'cancelled') ||
    peladas[0] ||
    null;

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [quickModal, setQuickModal] = useState<MatchEventType | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [selectedAssistId, setSelectedAssistId] = useState<string>('');
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activePelada?.live.isRunning) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activePelada?.live.isRunning]);

  const elapsedSeconds = useMemo(() => {
    if (!activePelada) return 0;
    const base = activePelada.live.elapsedSeconds || 0;
    if (activePelada.live.isRunning && activePelada.live.lastStartedAt) {
      return (
        base + Math.max(0, Math.floor((nowTick - activePelada.live.lastStartedAt) / 1000))
      );
    }
    return base;
  }, [activePelada, nowTick]);

  if (!activePelada) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
        Nenhuma pelada encontrada. Agende uma pelada primeiro.
      </div>
    );
  }

  const homeTeam =
    activePelada.teams.find((t) => t.id === activePelada.live.homeTeamId) ||
    activePelada.teams[0];
  const awayTeam =
    activePelada.teams.find((t) => t.id === activePelada.live.awayTeamId) ||
    activePelada.teams[1];

  function openQuickRecorder(type: MatchEventType, defaultTeamId?: string) {
    if (!isAdmin || !activePelada) return;
    setQuickModal(type);
    const tid = defaultTeamId || homeTeam?.id || activePelada.teams[0]?.id || '';
    setSelectedTeamId(tid);
    setSelectedPlayerId('');
    setSelectedAssistId('');
  }

  const modalTeam = activePelada.teams.find((t) => t.id === selectedTeamId);
  const modalTeamPlayers = useMemo(() => {
    if (!modalTeam) return [];
    const list = modalTeam.playerIds
      .map((id) => playerMap.get(id))
      .filter((p): p is PlayerProfile => Boolean(p));
    if (quickModal === 'save') {
      // Put goalkeepers first for Defensa Difícil
      return [...list].sort((a, b) =>
        a.preferredPosition === 'Goleiro' && b.preferredPosition !== 'Goleiro'
          ? -1
          : b.preferredPosition === 'Goleiro' && a.preferredPosition !== 'Goleiro'
            ? 1
            : 0,
      );
    }
    return list;
  }, [modalTeam, playerMap, quickModal]);

  async function handleConfirmEvent() {
    if (!activePelada || !quickModal || !selectedTeamId || !selectedPlayerId) return;
    setBusy(true);
    try {
      await onAddEvent(activePelada.id, {
        type: quickModal,
        teamId: selectedTeamId,
        playerId: selectedPlayerId,
        assistPlayerId:
          quickModal === 'goal' && selectedAssistId ? selectedAssistId : undefined,
      });
      setQuickModal(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Context Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">
            Beira de Quadra · Ao Vivo
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Controles rápidos de placar, gols, assistências e defesas difíceis.
          </p>
        </div>

        <select
          aria-label="Selecionar pelada"
          value={activePelada.id}
          onChange={(e) => onSelectPelada(e.target.value)}
          className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
        >
          {peladas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} (
              {p.status === 'completed'
                ? 'Concluída'
                : p.status === 'live'
                  ? 'Ao vivo'
                  : p.status === 'cancelled'
                    ? 'Cancelada'
                    : 'Agendada'}
              )
            </option>
          ))}
        </select>
      </div>

      {/* High-Contrast Scoreboard Card */}
      <section className="bg-slate-950 text-white rounded-3xl p-5 sm:p-8 border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pb-4 border-b border-slate-800">
          <span className="font-medium">
            {activePelada.status === 'live'
              ? 'Partida em andamento'
              : activePelada.status === 'completed'
                ? 'Pelada encerrada'
                : activePelada.status === 'cancelled'
                  ? 'Pelada cancelada'
                  : 'Pronta para iniciar'}
          </span>
          <span className="font-mono tabular-nums text-base sm:text-lg font-bold text-emerald-400">
            {formatClock(elapsedSeconds)}
          </span>
        </div>

        {/* Score Row */}
        <div className="py-6 sm:py-8 grid grid-cols-3 items-center gap-2 sm:gap-6 text-center">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-emerald-400 uppercase tracking-wide truncate">
              {homeTeam?.name || 'Time A'}
            </p>
            {isAdmin && activePelada.teams.length > 2 && activePelada.status !== 'completed' && (
              <select
                aria-label="Time mandante"
                value={homeTeam?.id || ''}
                onChange={(e) =>
                  onLiveControl(activePelada.id, {
                    action: 'set_matchup',
                    homeTeamId: e.target.value,
                    awayTeamId: awayTeam?.id,
                  })
                }
                className="mt-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs px-2 py-1 text-slate-200"
              >
                {activePelada.teams
                  .filter((t) => t.id !== awayTeam?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
            <p className="mt-2 text-5xl sm:text-7xl font-display font-extrabold font-mono tabular-nums text-white">
              {activePelada.live.homeScore}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center">
            <span className="text-xl sm:text-2xl font-display font-bold text-slate-500">
              ×
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-amber-400 uppercase tracking-wide truncate">
              {awayTeam?.name || 'Time B'}
            </p>
            {isAdmin && activePelada.teams.length > 2 && activePelada.status !== 'completed' && (
              <select
                aria-label="Time visitante"
                value={awayTeam?.id || ''}
                onChange={(e) =>
                  onLiveControl(activePelada.id, {
                    action: 'set_matchup',
                    homeTeamId: homeTeam?.id,
                    awayTeamId: e.target.value,
                  })
                }
                className="mt-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs px-2 py-1 text-slate-200"
              >
                {activePelada.teams
                  .filter((t) => t.id !== homeTeam?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
            <p className="mt-2 text-5xl sm:text-7xl font-display font-extrabold font-mono tabular-nums text-white">
              {activePelada.live.awayScore}
            </p>
          </div>
        </div>

        {/* Admin Clock & Match Actions */}
        {isAdmin && (
          <div className="pt-4 border-t border-slate-800 space-y-3">
            {activePelada.status === 'cancelled' ? (
              <p className="text-xs text-red-300">
                Esta pelada foi cancelada ({activePelada.cancellationReason || 'Cancelada pela administração'}). Reative na aba Pelada para registrar lances.
              </p>
            ) : activePelada.status !== 'completed' ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onLiveControl(activePelada.id, {
                        action: activePelada.live.isRunning ? 'pause' : 'start',
                      })
                    }
                    className={`min-h-[48px] rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                      activePelada.live.isRunning
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {activePelada.live.isRunning ? (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>Pausar</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Iniciar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onLiveControl(activePelada.id, { action: 'next_game' })
                    }
                    className="min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Zerar Placar</span>
                  </button>

                  {confirmFinish ? (
                    <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await onLiveControl(activePelada.id, {
                            action: 'finish_pelada',
                          });
                          setConfirmFinish(false);
                          onFinishAndVote(activePelada.id);
                        }}
                        className="flex-1 min-h-[48px] rounded-xl bg-white text-slate-950 font-bold text-xs px-3 cursor-pointer"
                      >
                        Confirmar Fim
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmFinish(false)}
                        className="min-h-[48px] px-3 rounded-xl bg-slate-800 text-slate-300 text-xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmFinish(true)}
                      className="col-span-2 sm:col-span-1 min-h-[48px] rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Encerrar Pelada</span>
                    </button>
                  )}
                </div>

                {/* Big Thumb-Friendly Quick Stat Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => openQuickRecorder('goal', homeTeam?.id)}
                    className="min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-display font-bold text-base flex items-center justify-center gap-2.5 transition-transform cursor-pointer"
                  >
                    <Trophy className="w-5 h-5" />
                    <span>+ Marcar Gol</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openQuickRecorder('assist', homeTeam?.id)}
                    className="min-h-[56px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-display font-bold text-base flex items-center justify-center gap-2.5 transition-transform cursor-pointer"
                  >
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span>+ Assistência</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openQuickRecorder('save', homeTeam?.id)}
                    className="min-h-[56px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-display font-bold text-base flex items-center justify-center gap-2.5 transition-transform cursor-pointer"
                  >
                    <Shield className="w-5 h-5 text-emerald-400" />
                    <span>+ Defesa Difícil</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-300">
                  Pelada concluída! A votação do Craque da Pelada está aberta.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onLiveControl(activePelada.id, { action: 'reopen_live' })
                    }
                    className="min-h-[42px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Reabrir Partida
                  </button>
                  <button
                    type="button"
                    onClick={() => onFinishAndVote(activePelada.id)}
                    className="min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    Ir para Votação
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Live Timeline Feed */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <h2 className="text-base font-display font-bold text-slate-900">
            Lances Registrados ({activePelada.live.events.length})
          </h2>
          <span className="text-xs text-slate-500">Ordem do mais recente</span>
        </div>

        {activePelada.live.events.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Nenhum gol, assistência ou defesa registrada ainda nesta pelada.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activePelada.live.events.map((ev) => {
              const player = playerMap.get(ev.playerId);
              const assistPlayer = ev.assistPlayerId
                ? playerMap.get(ev.assistPlayerId)
                : undefined;
              const team = activePelada.teams.find((t) => t.id === ev.teamId);

              const label =
                ev.type === 'goal'
                  ? 'Gol'
                  : ev.type === 'assist'
                    ? 'Assistência'
                    : 'Defesa Difícil';

              return (
                <div
                  key={ev.id}
                  className="py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 text-xs font-mono tabular-nums font-bold text-slate-500 shrink-0">
                      {ev.minute}&apos;
                    </span>
                    <PlayerAvatar
                      name={player?.name || 'Atleta'}
                      src={player?.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        <span
                          className={
                            ev.type === 'goal'
                              ? 'text-emerald-700'
                              : ev.type === 'save'
                                ? 'text-amber-700'
                                : 'text-slate-800'
                          }
                        >
                          {label}
                        </span>{' '}
                        · {player?.name || 'Atleta'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {team?.name || 'Time'}
                        {assistPlayer && (
                          <> · Assistência de {assistPlayer.name.split(' ')[0]}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {isAdmin && activePelada.status !== 'completed' && (
                    <button
                      type="button"
                      aria-label="Desfazer lance"
                      onClick={() => onDeleteEvent(activePelada.id, ev.id)}
                      className="min-h-[40px] px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Desfazer</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom Sheet / Modal: Registro Rápido em 2 Toques */}
      {quickModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-lg font-display font-bold text-slate-900">
                {quickModal === 'goal'
                  ? 'Registrar Gol'
                  : quickModal === 'assist'
                    ? 'Registrar Assistência'
                    : 'Registrar Defesa Difícil'}
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setQuickModal(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Pick Team */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">
                1. Selecione o time
              </p>
              <div className="grid grid-cols-2 gap-2">
                {activePelada.teams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTeamId(t.id);
                      setSelectedPlayerId('');
                      setSelectedAssistId('');
                    }}
                    className={`min-h-[46px] rounded-xl border text-sm font-bold cursor-pointer ${
                      selectedTeamId === t.id
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Pick Player */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">
                2. Quem fez {quickModal === 'goal' ? 'o gol' : quickModal === 'assist' ? 'a assistência' : 'a defesa'}?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {modalTeamPlayers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`min-h-[52px] px-3 py-2 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${
                      selectedPlayerId === p.id
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-600'
                    }`}
                  >
                    <PlayerAvatar name={p.name} src={p.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">
                        {p.name.split(' ')[0]}
                      </p>
                      <p
                        className={`text-[11px] truncate ${
                          selectedPlayerId === p.id ? 'text-emerald-100' : 'text-slate-500'
                        }`}
                      >
                        {p.preferredPosition}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Optional Assist for Goal */}
            {quickModal === 'goal' && selectedPlayerId && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  3. Assistência (opcional)
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAssistId('')}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      selectedAssistId === ''
                        ? 'bg-slate-800 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    Sem assistência
                  </button>
                  {modalTeamPlayers
                    .filter((p) => p.id !== selectedPlayerId)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedAssistId(p.id)}
                        className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                          selectedAssistId === p.id
                            ? 'bg-emerald-700 border-emerald-700 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {p.name.split(' ')[0]}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedPlayerId || busy}
              onClick={handleConfirmEvent}
              className="w-full min-h-[52px] rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-display font-bold text-base disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Registrando...' : 'Confirmar Lance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
