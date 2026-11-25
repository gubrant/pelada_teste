import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MapPin,
  Plus,
  RefreshCw,
  Repeat,
  Shield,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  DominantFoot,
  FutsalPosition,
  GroupSummary,
  PendingUserSummary,
  PlayerProfile,
  UserRole,
} from '../types';
import { formatBRL, formatDateBR } from '../utils/api';
import { WEEKDAY_NAMES } from '../utils/peladaTime';
import { PendingApprovalsSection } from './PendingApprovalsSection';

const POSITIONS: FutsalPosition[] = [
  'Goleiro',
  'Fixo',
  'Ala Esquerdo',
  'Ala Direito',
  'Pivô',
];

const FEET: DominantFoot[] = ['Destro', 'Canhoto', 'Ambidestro'];

function generateSixDigitPin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

interface PeladaHubViewProps {
  currentUser: PlayerProfile;
  groups: GroupSummary[];
  pendingUsers: PendingUserSummary[];
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
  onCreateHubPlayer: (payload: Record<string, unknown>) => Promise<{
    user: PlayerProfile;
    addedGroupIds: string[];
  }>;
  onApprovePendingUser: (
    userId: string,
    groupIds: string[],
    role: UserRole,
  ) => Promise<void>;
  onRejectPendingUser: (userId: string) => Promise<void>;
}

export function PeladaHubView({
  currentUser,
  groups,
  pendingUsers,
  onOpenGroup,
  onJoinGroup,
  onCreateGroup,
  onCreateHubPlayer,
  onApprovePendingUser,
  onRejectPendingUser,
}: PeladaHubViewProps) {
  const [hubTab, setHubTab] = useState<'groups' | 'addPlayer'>('groups');
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
  const adminGroups = myGroups.filter((g) => g.myRole === 'admin');

  // Hub Add Peladeiro form state
  const [playerName, setPlayerName] = useState('');
  const [playerUsername, setPlayerUsername] = useState('');
  const [playerUsernameEdited, setPlayerUsernameEdited] = useState(false);
  const [playerPin, setPlayerPin] = useState('');
  const [showPin, setShowPin] = useState(true);
  const [playerPosition, setPlayerPosition] =
    useState<FutsalPosition>('Ala Direito');
  const [playerFoot, setPlayerFoot] = useState<DominantFoot>('Destro');
  const [playerRole, setPlayerRole] = useState<UserRole>('player');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() =>
    adminGroups.slice(0, 1).map((g) => g.id),
  );
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [createdPlayerInfo, setCreatedPlayerInfo] = useState<{
    name: string;
    username: string;
    pin: string;
    groupCount: number;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

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

  function handlePlayerNameChange(value: string) {
    setPlayerName(value);
    if (!playerUsernameEdited) {
      const suggested = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '.')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 24);
      setPlayerUsername(suggested);
    }
  }

  function toggleTargetGroup(gid: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid],
    );
  }

  async function handleCopyHubCreds(info: {
    username: string;
    pin: string;
  }) {
    const text = `Seu acesso ao QuadraLivre:\nLogin: ${info.username}\nSenha: ${info.pin}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      window.setTimeout(() => setCopiedCreds(false), 2500);
    } catch {
      setCopiedCreds(false);
    }
  }

  async function handleCreateHubPlayerSubmit(e: FormEvent) {
    e.preventDefault();
    setPlayerError(null);
    setCreatedPlayerInfo(null);

    const cleanName = playerName.trim();
    const cleanUsername = playerUsername.trim().toLowerCase();
    const cleanPin = playerPin.trim();

    if (cleanName.length < 2) {
      setPlayerError('Informe o nome completo do peladeiro.');
      return;
    }
    if (!/^[a-z0-9._-]{2,30}$/.test(cleanUsername)) {
      setPlayerError(
        'Login inválido. Use 2 a 30 caracteres (letras minúsculas, números, ponto ou underline).',
      );
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      setPlayerError('A senha deve conter exatamente 6 dígitos numéricos.');
      return;
    }

    setSavingPlayer(true);
    try {
      const res = await onCreateHubPlayer({
        name: cleanName,
        username: cleanUsername,
        pin: cleanPin,
        preferredPosition: playerPosition,
        dominantFoot: playerFoot,
        role: playerRole,
        groupIds: selectedGroupIds,
      });

      setCreatedPlayerInfo({
        name: res.user.name,
        username: res.user.username,
        pin: cleanPin,
        groupCount: res.addedGroupIds.length,
      });

      setPlayerName('');
      setPlayerUsername('');
      setPlayerUsernameEdited(false);
      setPlayerPin('');
      setPlayerRole('player');
    } catch (err) {
      setPlayerError(
        err instanceof Error ? err.message : 'Erro ao cadastrar peladeiro.',
      );
    } finally {
      setSavingPlayer(false);
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

      {/* Hub Tabs (when user is admin of at least one pelada) */}
      {adminGroups.length > 0 && (
        <div className="inline-flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-2xl">
          <button
            type="button"
            onClick={() => setHubTab('groups')}
            className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hubTab === 'groups'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Peladas Fixas ({groups.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setHubTab('addPlayer');
              setPlayerError(null);
              if (selectedGroupIds.length === 0 && adminGroups[0]) {
                setSelectedGroupIds([adminGroups[0].id]);
              }
            }}
            className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hubTab === 'addPlayer'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Adicionar Peladeiro</span>
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {adminGroups.length > 0 && pendingUsers.length > 0 && (
        <PendingApprovalsSection
          pendingUsers={pendingUsers}
          adminGroups={adminGroups}
          onApprove={onApprovePendingUser}
          onReject={onRejectPendingUser}
        />
      )}

      {hubTab === 'addPlayer' && adminGroups.length > 0 ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 max-w-3xl space-y-6">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-700" />
              <span>Cadastrar Peladeiro (Login e Senha)</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Crie o login e a senha de 6 dígitos do novo atleta e selecione em quais das suas peladas ele já entrará.
            </p>
          </div>

          {playerError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {playerError}
            </div>
          )}

          {createdPlayerInfo && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-display font-bold text-emerald-950 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>{createdPlayerInfo.name} cadastrado(a)!</span>
                </p>
                <p className="text-xs text-emerald-900 font-mono tabular-nums">
                  Login: <strong>{createdPlayerInfo.username}</strong> · Senha:{' '}
                  <strong>{createdPlayerInfo.pin}</strong>
                  {createdPlayerInfo.groupCount > 0 &&
                    ` · Adicionado a ${createdPlayerInfo.groupCount} pelada(s)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyHubCreds(createdPlayerInfo)}
                className="min-h-[40px] px-3.5 rounded-xl bg-white border border-emerald-300 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedCreds ? 'Copiado!' : 'Copiar acesso'}</span>
              </button>
            </div>
          )}

          <form onSubmit={handleCreateHubPlayerSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Rafael Costa"
                  value={playerName}
                  onChange={(e) => handlePlayerNameChange(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Login de acesso *
                </label>
                <input
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="ex: rafael.costa"
                  value={playerUsername}
                  onChange={(e) => {
                    setPlayerUsernameEdited(true);
                    setPlayerUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
                    );
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Senha (6 dígitos) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerPin(generateSixDigitPin());
                      setShowPin(true);
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Gerar</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={playerPin}
                    onChange={(e) =>
                      setPlayerPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-slate-300 text-sm font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="button"
                    aria-label={showPin ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  >
                    {showPin ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Posição preferida
                </label>
                <select
                  value={playerPosition}
                  onChange={(e) =>
                    setPlayerPosition(e.target.value as FutsalPosition)
                  }
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                >
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pé dominante
                </label>
                <select
                  value={playerFoot}
                  onChange={(e) =>
                    setPlayerFoot(e.target.value as DominantFoot)
                  }
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                >
                  {FEET.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-800">
                  Incluir nas suas peladas (como {playerRole === 'admin' ? 'Administrador' : 'Peladeiro'})
                </label>
                <select
                  aria-label="Papel nas peladas selecionadas"
                  value={playerRole}
                  onChange={(e) => setPlayerRole(e.target.value as UserRole)}
                  className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800"
                >
                  <option value="player">Entrar como Peladeiro</option>
                  <option value="admin">Entrar como Administrador</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {adminGroups.map((grp) => {
                  const checked = selectedGroupIds.includes(grp.id);
                  return (
                    <label
                      key={grp.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        checked
                          ? 'border-emerald-600 bg-emerald-50/70'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTargetGroup(grp.id)}
                        className="w-4 h-4 accent-emerald-700"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {grp.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {WEEKDAY_NAMES[grp.dayOfWeek]} · {grp.time}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPlayer}
                className="min-h-[48px] w-full sm:w-auto px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {savingPlayer
                    ? 'Cadastrando...'
                    : 'Cadastrar Peladeiro com Login e Senha'}
                </span>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>
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
        </>
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
