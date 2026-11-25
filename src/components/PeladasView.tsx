import { useMemo, useState, type FormEvent } from 'react';
import {
  Award,
  Calendar,
  Check,
  GripVertical,
  MapPin,
  Plus,
  Radio,
  Shuffle,
  Trash2,
  Users,
  Vote,
  X,
} from 'lucide-react';
import type { PeladaSession, PlayerProfile, TeamRoster } from '../types';
import { formatDateBR } from '../utils/api';
import { PlayerAvatar } from './PlayerAvatar';

interface PeladasViewProps {
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  peladas: PeladaSession[];
  selectedPeladaId: string | null;
  onSelectPelada: (id: string) => void;
  onCreatePelada: (payload: {
    title: string;
    date: string;
    time: string;
    location: string;
    teamCount: number;
    presentPlayerIds: string[];
  }) => Promise<PeladaSession>;
  onDeletePelada: (id: string) => Promise<void>;
  onToggleAttendance: (peladaId: string, playerId?: string) => Promise<void>;
  onDrawTeams: (peladaId: string, teamCount: number) => Promise<void>;
  onUpdateTeams: (peladaId: string, teams: TeamRoster[]) => Promise<void>;
  onCastVote: (peladaId: string, targetPlayerId: string) => Promise<void>;
  onOpenLive: (peladaId: string) => void;
}

const TEAM_HEADER_STYLES: Record<TeamRoster['color'], string> = {
  emerald: 'bg-emerald-700 text-white',
  amber: 'bg-amber-600 text-white',
  slate: 'bg-slate-800 text-white',
  rose: 'bg-rose-700 text-white',
};

export function PeladasView({
  currentUser,
  players,
  peladas,
  selectedPeladaId,
  onSelectPelada,
  onCreatePelada,
  onDeletePelada,
  onToggleAttendance,
  onDrawTeams,
  onUpdateTeams,
  onCastVote,
  onOpenLive,
}: PeladasViewProps) {
  const isAdmin = currentUser.role === 'admin';
  const activePlayers = useMemo(() => players.filter((p) => p.active), [players]);
  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const selectedPelada =
    peladas.find((p) => p.id === selectedPeladaId) || peladas[0] || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedPlayer, setDraggedPlayer] = useState<{
    playerId: string;
    fromTeamId: string;
  } | null>(null);
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create pelada form
  const [title, setTitle] = useState('Pelada Oficial · Quadra Coberta');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('20:30');
  const [location, setLocation] = useState('Ginásio Arena Sul — Quadra 1');
  const [teamCount, setTeamCount] = useState(2);

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusyAction('create');
    try {
      const created = await onCreatePelada({
        title: title.trim() || 'Pelada Oficial',
        date,
        time,
        location: location.trim() || 'Quadra 1',
        teamCount,
        presentPlayerIds: activePlayers.map((p) => p.id),
      });
      onSelectPelada(created.id);
      setShowCreateModal(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao criar pelada.');
    } finally {
      setBusyAction(null);
    }
  }

  async function movePlayerToTeam(
    playerId: string,
    fromTeamId: string,
    toTeamId: string,
  ) {
    if (!selectedPelada || !isAdmin || fromTeamId === toTeamId) return;
    setActionError(null);
    const updatedTeams = selectedPelada.teams.map((team) => {
      if (team.id === fromTeamId) {
        return {
          ...team,
          playerIds: team.playerIds.filter((pid) => pid !== playerId),
        };
      }
      if (team.id === toTeamId) {
        return {
          ...team,
          playerIds: [...team.playerIds, playerId],
        };
      }
      return team;
    });
    setBusyAction('move');
    try {
      await onUpdateTeams(selectedPelada.id, updatedTeams);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao mover atleta.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDraw(count: number) {
    if (!selectedPelada || !isAdmin) return;
    setActionError(null);
    setBusyAction('draw');
    try {
      await onDrawTeams(selectedPelada.id, count);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao sortear times.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVote(targetId: string) {
    if (!selectedPelada) return;
    setActionError(null);
    setBusyAction(`vote-${targetId}`);
    try {
      await onCastVote(selectedPelada.id, targetId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao registrar voto.');
    } finally {
      setBusyAction(null);
    }
  }

  const voteStats = useMemo(() => {
    if (!selectedPelada) return { counts: new Map<string, number>(), topIds: new Set<string>(), myVote: null as string | null };
    const counts = new Map<string, number>();
    let myVote: string | null = null;
    for (const v of selectedPelada.votes) {
      counts.set(v.targetPlayerId, (counts.get(v.targetPlayerId) || 0) + 1);
      if (v.voterId === currentUser.id) {
        myVote = v.targetPlayerId;
      }
    }
    let max = 0;
    for (const c of counts.values()) {
      if (c > max) max = c;
    }
    const topIds = new Set<string>();
    if (max > 0) {
      for (const [pid, c] of counts.entries()) {
        if (c === max) topIds.add(pid);
      }
    }
    return { counts, topIds, myVote };
  }, [selectedPelada, currentUser.id]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">
            Peladas, Times & Votação
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Confirme presença, sorteie times equilibrados e vote no craque após o apito final.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Agendar Pelada</span>
          </button>
        )}
      </div>

      {/* Pelada Selector Strip */}
      {peladas.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {peladas.map((pel) => {
            const selected = selectedPelada?.id === pel.id;
            const statusLabel =
              pel.status === 'live'
                ? 'Ao vivo'
                : pel.status === 'completed'
                  ? 'Concluída'
                  : 'Agendada';
            return (
              <button
                key={pel.id}
                type="button"
                onClick={() => onSelectPelada(pel.id)}
                className={`min-h-[48px] px-4 py-2 rounded-xl border text-left transition-colors shrink-0 cursor-pointer ${
                  selected
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                }`}
              >
                <p className="text-xs font-semibold whitespace-nowrap">
                  {pel.title}
                </p>
                <p
                  className={`text-[11px] font-mono tabular-nums whitespace-nowrap ${
                    selected ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {formatDateBR(pel.date)} · {pel.time} · {statusLabel}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {!selectedPelada ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Nenhuma pelada cadastrada ainda.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected Pelada Summary Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-700">
                <span>
                  {selectedPelada.status === 'live'
                    ? 'Partida Ao Vivo'
                    : selectedPelada.status === 'completed'
                      ? 'Pelada Concluída · Votação Liberada'
                      : 'Pelada Agendada'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {formatDateBR(selectedPelada.date)} às {selectedPelada.time}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-900 mt-1">
                {selectedPelada.title}
              </h2>
              <p className="text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {selectedPelada.location}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <Users className="w-4 h-4 text-slate-400" />
                  {selectedPelada.presentPlayerIds.length} confirmados
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {selectedPelada.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => onToggleAttendance(selectedPelada.id)}
                  className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold border inline-flex items-center gap-2 cursor-pointer ${
                    selectedPelada.presentPlayerIds.includes(currentUser.id)
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {selectedPelada.presentPlayerIds.includes(currentUser.id)
                      ? 'Vou jogar'
                      : 'Confirmar presença'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenLive(selectedPelada.id)}
                className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Painel Ao Vivo</span>
              </button>

              {isAdmin && (
                confirmDeleteId === selectedPelada.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeletePelada(selectedPelada.id);
                        setConfirmDeleteId(null);
                      }}
                      className="min-h-[44px] px-3 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="Excluir pelada"
                    onClick={() => setConfirmDeleteId(selectedPelada.id)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
            </div>
          </div>

          {/* Lista de Presença (Admin pode marcar qualquer um) */}
          {selectedPelada.status !== 'completed' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900">
                    Lista de Presença ({selectedPelada.presentPlayerIds.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAdmin
                      ? 'Toque nos atletas para confirmar ou remover da pelada antes do sorteio.'
                      : 'Atletas confirmados para esta edição.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {activePlayers.map((player) => {
                  const present = selectedPelada.presentPlayerIds.includes(player.id);
                  const canToggle = isAdmin || player.id === currentUser.id;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      disabled={!canToggle}
                      onClick={() => onToggleAttendance(selectedPelada.id, player.id)}
                      className={`min-h-[48px] px-3 py-2 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${
                        present
                          ? 'bg-emerald-50/70 border-emerald-600 text-slate-900'
                          : 'bg-white border-slate-200 text-slate-500 opacity-75'
                      } ${canToggle ? 'cursor-pointer hover:border-emerald-700' : 'cursor-default'}`}
                    >
                      <PlayerAvatar name={player.name} src={player.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">
                          {player.name.split(' ')[0]}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 truncate">
                          {player.preferredPosition === 'Goleiro' ? 'GOL' : player.preferredPosition.split(' ')[0]} · {player.finalRating.toFixed(1)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Times Formados & Balanceamento */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-display font-bold text-slate-900">
                  Times Equilibrados
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Balanceamento automático pela Nota Final e distribuição de goleiros.
                  {isAdmin && ' Arraste atletas entre os times ou use os botões rápidos.'}
                </p>
              </div>

              {isAdmin && selectedPelada.status !== 'completed' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                    {[2, 3, 4].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => handleDraw(count)}
                        disabled={busyAction === 'draw'}
                        className={`min-h-[36px] px-3 text-xs font-semibold rounded-lg cursor-pointer ${
                          selectedPelada.teamCount === count
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {count} Times
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDraw(selectedPelada.teamCount)}
                    disabled={busyAction === 'draw'}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>
                      {busyAction === 'draw' ? 'Sorteando...' : 'Sortear Times'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div
              className={`grid grid-cols-1 gap-4 ${
                selectedPelada.teams.length === 2
                  ? 'md:grid-cols-2'
                  : selectedPelada.teams.length === 3
                    ? 'md:grid-cols-3'
                    : 'md:grid-cols-2 xl:grid-cols-4'
              }`}
            >
              {selectedPelada.teams.map((team) => {
                const members = team.playerIds
                  .map((id) => playerMap.get(id))
                  .filter((p): p is PlayerProfile => Boolean(p));
                const avg =
                  members.length > 0
                    ? members.reduce((s, m) => s + m.finalRating, 0) / members.length
                    : 0;

                return (
                  <div
                    key={team.id}
                    onDragOver={(e) => {
                      if (!isAdmin) return;
                      e.preventDefault();
                      setDragOverTeamId(team.id);
                    }}
                    onDragLeave={() => setDragOverTeamId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverTeamId(null);
                      if (draggedPlayer && isAdmin) {
                        movePlayerToTeam(
                          draggedPlayer.playerId,
                          draggedPlayer.fromTeamId,
                          team.id,
                        );
                        setDraggedPlayer(null);
                      }
                    }}
                    className={`rounded-2xl border overflow-hidden transition-colors ${
                      dragOverTeamId === team.id
                        ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/30'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div
                      className={`px-4 py-3 flex items-center justify-between ${TEAM_HEADER_STYLES[team.color]}`}
                    >
                      <span className="font-display font-bold text-base">
                        {team.name}
                      </span>
                      <span className="text-xs font-mono tabular-nums opacity-95">
                        {members.length} atl · Média {avg.toFixed(1)}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {members.length === 0 ? (
                        <p className="p-4 text-xs text-slate-400 text-center">
                          Sem atletas neste time
                        </p>
                      ) : (
                        members.map((member) => (
                          <div
                            key={member.id}
                            draggable={isAdmin && selectedPelada.status !== 'completed'}
                            onDragStart={() =>
                              setDraggedPlayer({
                                playerId: member.id,
                                fromTeamId: team.id,
                              })
                            }
                            onDragEnd={() => {
                              setDraggedPlayer(null);
                              setDragOverTeamId(null);
                            }}
                            className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isAdmin && selectedPelada.status !== 'completed' && (
                                <GripVertical className="w-4 h-4 text-slate-300 shrink-0 hidden sm:block cursor-grab" />
                              )}
                              <PlayerAvatar
                                name={member.name}
                                src={member.avatarUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {member.name}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {member.preferredPosition} ·{' '}
                                  <span className="font-mono tabular-nums font-medium text-slate-700">
                                    {member.finalRating.toFixed(1)}
                                  </span>
                                </p>
                              </div>
                            </div>

                            {isAdmin && selectedPelada.status !== 'completed' && (
                              <div className="flex items-center gap-1 shrink-0">
                                {selectedPelada.teams
                                  .filter((other) => other.id !== team.id)
                                  .map((other) => (
                                    <button
                                      key={other.id}
                                      type="button"
                                      title={`Mover para ${other.name}`}
                                      onClick={() =>
                                        movePlayerToTeam(member.id, team.id, other.id)
                                      }
                                      className="min-w-[32px] min-h-[34px] px-2 rounded-lg border border-slate-200 hover:border-emerald-600 hover:text-emerald-700 text-[11px] font-mono font-semibold text-slate-600 cursor-pointer"
                                    >
                                      →{other.name.replace('Time ', '')}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Votação Pós-Jogo */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <Vote className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900">
                    Votação Pós-Jogo · Craque da Pelada
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedPelada.status === 'completed'
                      ? 'Liberada para atletas presentes. Regra: 1 voto por peladeiro e proibido votar em si mesmo.'
                      : 'A votação será liberada automaticamente quando o Administrador encerrar a pelada no Painel Ao Vivo.'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 shrink-0">
                {selectedPelada.votes.length} / {selectedPelada.presentPlayerIds.length} votos
              </span>
            </div>

            {selectedPelada.status !== 'completed' ? (
              <div className="py-6 text-center text-sm text-slate-500">
                Partida ainda não concluída. Acompanhe ou encerre pelo{' '}
                <button
                  type="button"
                  onClick={() => onOpenLive(selectedPelada.id)}
                  className="text-emerald-700 font-semibold underline cursor-pointer"
                >
                  Painel Ao Vivo
                </button>
                .
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedPelada.presentPlayerIds
                  .map((id) => playerMap.get(id))
                  .filter((p): p is PlayerProfile => Boolean(p))
                  .sort(
                    (a, b) =>
                      (voteStats.counts.get(b.id) || 0) -
                      (voteStats.counts.get(a.id) || 0),
                  )
                  .map((candidate) => {
                    const count = voteStats.counts.get(candidate.id) || 0;
                    const isSelf = candidate.id === currentUser.id;
                    const isMyChoice = voteStats.myVote === candidate.id;
                    const isLeader = voteStats.topIds.has(candidate.id);
                    const presentVoter = selectedPelada.presentPlayerIds.includes(
                      currentUser.id,
                    );
                    const totalVotes = Math.max(1, selectedPelada.votes.length);
                    const pct = Math.round((count / totalVotes) * 100);

                    return (
                      <div
                        key={candidate.id}
                        className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                          isMyChoice
                            ? 'border-emerald-700 bg-emerald-50/40'
                            : isLeader
                              ? 'border-amber-400 bg-amber-50/30'
                              : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar
                              name={candidate.name}
                              src={candidate.avatarUrl}
                              size="md"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                                <span>{candidate.name}</span>
                                {isLeader && (
                                  <Award className="w-4 h-4 text-amber-600 shrink-0" />
                                )}
                              </p>
                              <p className="text-xs text-slate-500">
                                {candidate.preferredPosition} ·{' '}
                                <span className="font-mono tabular-nums">
                                  {count} {count === 1 ? 'voto' : 'votos'} ({pct}%)
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isLeader ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {isSelf ? (
                          <p className="text-xs text-slate-500 italic py-1">
                            Você não pode votar em si mesmo
                          </p>
                        ) : !presentVoter ? (
                          <p className="text-xs text-slate-500 py-1">
                            Apenas atletas presentes votam
                          </p>
                        ) : (
                          <button
                            type="button"
                            disabled={busyAction === `vote-${candidate.id}`}
                            onClick={() => handleVote(candidate.id)}
                            className={`min-h-[42px] w-full rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                              isMyChoice
                                ? 'bg-emerald-700 text-white'
                                : 'border border-slate-300 bg-white text-slate-800 hover:border-emerald-700 hover:text-emerald-700'
                            }`}
                          >
                            {isMyChoice ? 'Seu voto (Craque)' : 'Votar em ' + candidate.name.split(' ')[0]}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Agendar Nova Pelada */}
      {showCreateModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-display font-bold text-slate-900">
                Agendar Nova Pelada
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setShowCreateModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Título da pelada
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Horário
                  </label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
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
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Quantidade inicial de times
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 4].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setTeamCount(cnt)}
                      className={`min-h-[44px] rounded-xl border text-sm font-semibold cursor-pointer ${
                        teamCount === cnt
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {cnt} Times
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'create'}
                  className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer"
                >
                  {busyAction === 'create' ? 'Agendando...' : 'Criar & Sortear Times'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
