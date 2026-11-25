import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Calendar,
  MapPin,
  Plus,
  Repeat,
  Shield,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { GroupSummary, PlayerProfile } from '../types';
import { formatBRL, formatDateBR } from '../utils/api';
import { WEEKDAY_NAMES } from '../utils/peladaTime';

interface PeladaHubViewProps {
  currentUser: PlayerProfile;
  groups: GroupSummary[];
  onOpenGroup: (groupId: string) => void;
  onJoinGroup: (groupId: string) => Promise<void>;
  onCreateGroup: (payload: {
    name: string;
    description: string;
    dayOfWeek: number;
    time: string;
    location: string;
    teamCount: number;
    playersPerTeam: number;
    autoSchedule: boolean;
  }) => Promise<void>;
}

export function PeladaHubView({
  currentUser,
  groups,
  onOpenGroup,
  onJoinGroup,
  onCreateGroup,
}: PeladaHubViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create new fixed pelada state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(3); // Quarta-feira
  const [time, setTime] = useState('20:30');
  const [location, setLocation] = useState('');
  const [teamCount, setTeamCount] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(5);
  const [autoSchedule, setAutoSchedule] = useState(true);

  const myGroups = groups.filter((g) => g.isMember);
  const otherGroups = groups.filter((g) => !g.isMember);

  async function handleJoin(groupId: string) {
    setError(null);
    setBusyGroupId(groupId);
    try {
      await onJoinGroup(groupId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível entrar na pelada.',
      );
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Informe o nome da pelada fixa.');
      return;
    }
    setCreating(true);
    try {
      await onCreateGroup({
        name: name.trim(),
        description: description.trim(),
        dayOfWeek,
        time,
        location: location.trim() || 'Quadra Principal',
        teamCount,
        playersPerTeam,
        autoSchedule,
      });
      setName('');
      setDescription('');
      setLocation('');
      setShowCreateModal(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao criar pelada fixa.',
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Olá, {currentUser.name.split(' ')[0]} · @{currentUser.username}
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mt-1">
            Peladas Fixas Existentes
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Cada pelada fixa possui elenco, administradores, caixa financeiro, jogos, sorteio de times e votação independentes. Você pode entrar em uma pelada ou criar a sua própria e se tornar administrador dela.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowCreateModal(true);
          }}
          className="min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Pelada Fixa</span>
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Minhas Peladas Fixas */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">
              Minhas Peladas ({myGroups.length})
            </h2>
            <p className="text-xs text-slate-500">
              Peladas em que você participa como peladeiro ou administrador
            </p>
          </div>
        </div>

        {myGroups.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm text-slate-600">
              Você ainda não participa de nenhuma pelada fixa.
            </p>
            <p className="text-xs text-slate-500">
              Crie uma nova pelada fixa agora mesmo para ser o administrador dela ou entre em uma pelada existente abaixo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myGroups.map((group) => (
              <div
                key={group.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 hover:border-emerald-600 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span
                      className={
                        group.myRole === 'admin'
                          ? 'text-emerald-700 font-semibold inline-flex items-center gap-1'
                          : 'text-slate-600'
                      }
                    >
                      {group.myRole === 'admin' && <Shield className="w-3.5 h-3.5" />}
                      {group.myRole === 'admin' ? 'Administrador' : 'Peladeiro'}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-slate-600">
                      Toda {WEEKDAY_NAMES[group.dayOfWeek] || 'semana'} às{' '}
                      <span className="font-mono tabular-nums">{group.time}</span>
                    </span>
                    {group.autoSchedule && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-500 inline-flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          Fixa semanal
                        </span>
                      </>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xl font-display font-bold text-slate-900">
                      {group.name}
                    </h3>
                    {group.description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {group.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-1 space-y-1.5 text-xs text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{group.location}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {group.memberCount} peladeiros · {group.teamCount}×{group.playersPerTeam}
                      </span>
                      {group.balance !== undefined && (
                        <span className="inline-flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                          Caixa: {formatBRL(group.balance)}
                        </span>
                      )}
                    </div>
                    {group.nextMatchDate && (
                      <p className="inline-flex items-center gap-1.5 text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          Próximo jogo: {formatDateBR(group.nextMatchDate)} às {group.nextMatchTime}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenGroup(group.id)}
                  className="min-h-[44px] w-full px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Abrir Pelada</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Outras Peladas Fixas Existentes */}
      {otherGroups.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">
              Outras Peladas Fixas ({otherGroups.length})
            </h2>
            <p className="text-xs text-slate-500">
              Peladas cadastradas na plataforma disponíveis para participar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherGroups.map((group) => (
              <div
                key={group.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      Toda {WEEKDAY_NAMES[group.dayOfWeek] || 'semana'} ·{' '}
                      <span className="font-mono tabular-nums">{group.time}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Organizador: {group.creatorName.split(' ')[0]}</span>
                  </div>

                  <h3 className="text-lg font-display font-bold text-slate-900">
                    {group.name}
                  </h3>

                  {group.description && (
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {group.description}
                    </p>
                  )}

                  <div className="space-y-1 text-xs text-slate-600 pt-1">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{group.location}</span>
                    </p>
                    <p className="flex items-center gap-1.5 font-mono tabular-nums">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {group.memberCount} peladeiros · {group.teamCount} times de{' '}
                        {group.playersPerTeam}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyGroupId === group.id}
                  onClick={() => handleJoin(group.id)}
                  className="min-h-[44px] w-full px-4 rounded-xl border border-emerald-700 text-emerald-800 hover:bg-emerald-50 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <span>
                    {busyGroupId === group.id
                      ? 'Entrando...'
                      : 'Participar desta Pelada'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal: Criar Nova Pelada Fixa */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900">
                  Criar Nova Pelada Fixa
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Você será automaticamente o Administrador desta pelada.
                </p>
              </div>
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
                  Nome da pelada fixa
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Pelada de Sábado · Clube Pinheiros"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Descrição curta (opcional)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="ex: Futsal semanal da turma, nível intermediário"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Dia da semana
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
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
                  placeholder="ex: Quadra Coberta Arena Sul"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantidade de times
                  </label>
                  <select
                    value={teamCount}
                    onChange={(e) => setTeamCount(Number(e.target.value))}
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
                    value={playersPerTeam}
                    onChange={(e) => setPlayersPerTeam(Number(e.target.value))}
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
                  checked={autoSchedule}
                  onChange={(e) => setAutoSchedule(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-700"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Agendar partidas automaticamente toda semana
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    O app cria a próxima partida no dia e horário fixos com confirmação até 1h antes do jogo.
                  </p>
                </div>
              </label>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 flex items-start gap-2">
                <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <p>
                  Ao criar esta pelada fixa, você se torna Administrador dela, podendo cadastrar/adicionar peladeiros, controlar o caixa e eleger outros administradores.
                </p>
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
                  disabled={creating}
                  className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {creating ? 'Criando...' : 'Criar Pelada Fixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
