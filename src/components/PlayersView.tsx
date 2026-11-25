import { useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  HeartPulse,
  Plus,
  Search,
  Shield,
  Sliders,
  Trash2,
  Upload,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AvailableUserOption,
  BloodType,
  DominantFoot,
  FutsalPosition,
  PlayerProfile,
  PlayerStatsSummary,
  SkillRatings,
  UserRole,
} from '../types';
import { compressImageFile } from '../utils/api';
import { PlayerAvatar } from './PlayerAvatar';

const POSITIONS: FutsalPosition[] = [
  'Goleiro',
  'Fixo',
  'Ala Esquerdo',
  'Ala Direito',
  'Pivô',
];

const FEET: DominantFoot[] = ['Destro', 'Canhoto', 'Ambidestro'];

const BLOOD_TYPES: BloodType[] = [
  'O+',
  'O-',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'Não informado',
];

const SKILL_FIELDS: { key: keyof SkillRatings; label: string }[] = [
  { key: 'habilidade', label: 'Habilidade' },
  { key: 'preparoFisico', label: 'Preparo Físico' },
  { key: 'chute', label: 'Chute' },
  { key: 'defesa', label: 'Capacidade de Defesa' },
  { key: 'ataque', label: 'Capacidade de Ataque' },
];

function avgSkill(skills: SkillRatings): number {
  const sum =
    skills.habilidade +
    skills.preparoFisico +
    skills.chute +
    skills.defesa +
    skills.ataque;
  return Math.round((sum / 5) * 10) / 10;
}

interface PlayersViewProps {
  currentUser: PlayerProfile;
  groupName: string;
  players: PlayerProfile[];
  availableUsers: AvailableUserOption[];
  stats: Record<string, PlayerStatsSummary>;
  onAddExistingMember: (existingUserId: string, role: UserRole) => Promise<void>;
  onCreatePlayer: (payload: Record<string, unknown>) => Promise<void>;
  onUpdatePlayer: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onDeletePlayer: (id: string) => Promise<void>;
}

type ModalTab = 'geral' | 'saude' | 'habilidades';
type AddMode = 'existing' | 'new';

export function PlayersView({
  currentUser,
  groupName,
  players,
  availableUsers,
  stats,
  onAddExistingMember,
  onCreatePlayer,
  onUpdatePlayer,
  onDeletePlayer,
}: PlayersViewProps) {
  const isAdmin = currentUser.role === 'admin';

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<'all' | FutsalPosition>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [roleQuickBusyId, setRoleQuickBusyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Selected player or new player modal
  const [editingPlayer, setEditingPlayer] = useState<PlayerProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('existing');
  const [selectedExistingId, setSelectedExistingId] = useState('');
  const [existingRole, setExistingRole] = useState<UserRole>('player');
  const [modalTab, setModalTab] = useState<ModalTab>('geral');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form states
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<UserRole>('player');
  const [active, setActive] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [address, setAddress] = useState('');
  const [dominantFoot, setDominantFoot] = useState<DominantFoot>('Destro');
  const [preferredPosition, setPreferredPosition] = useState<FutsalPosition>('Ala Direito');

  const [emergencyContact, setEmergencyContact] = useState('');
  const [healthPlan, setHealthPlan] = useState('');
  const [bloodType, setBloodType] = useState<BloodType>('O+');
  const [healthIssues, setHealthIssues] = useState('');
  const [continuousMedication, setContinuousMedication] = useState('');

  const [selfSkills, setSelfSkills] = useState<SkillRatings>({
    habilidade: 7,
    preparoFisico: 7,
    chute: 7,
    defesa: 7,
    ataque: 7,
  });
  const [adminSkills, setAdminSkills] = useState<SkillRatings>({
    habilidade: 7,
    preparoFisico: 7,
    chute: 7,
    defesa: 7,
    ataque: 7,
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const admins = useMemo(
    () => players.filter((p) => p.active && p.role === 'admin'),
    [players],
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => {
        if (statusFilter === 'active' && !p.active) return false;
        if (positionFilter !== 'all' && p.preferredPosition !== positionFilter) {
          return false;
        }
        if (
          q &&
          !p.name.toLowerCase().includes(q) &&
          !p.username.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.finalRating - a.finalRating);
  }, [players, search, positionFilter, statusFilter]);

  function openCreateModal() {
    setIsCreating(true);
    setEditingPlayer(null);
    setAddMode('new');
    setSelectedExistingId(availableUsers[0]?.id || '');
    setExistingRole('player');
    setModalTab('geral');
    setConfirmDelete(false);
    setFormError(null);

    setUsername('');
    setName('');
    setPin('');
    setRole('player');
    setActive(true);
    setAvatarUrl('');
    setAddress('');
    setDominantFoot('Destro');
    setPreferredPosition('Ala Direito');
    setEmergencyContact('');
    setHealthPlan('');
    setBloodType('O+');
    setHealthIssues('Nenhum');
    setContinuousMedication('Nenhum');
    setSelfSkills({ habilidade: 7, preparoFisico: 7, chute: 7, defesa: 7, ataque: 7 });
    setAdminSkills({ habilidade: 7, preparoFisico: 7, chute: 7, defesa: 7, ataque: 7 });
  }

  function openPlayerModal(player: PlayerProfile) {
    setIsCreating(false);
    setEditingPlayer(player);
    setModalTab('geral');
    setConfirmDelete(false);
    setFormError(null);

    setUsername(player.username);
    setName(player.name);
    setPin('');
    setRole(player.role);
    setActive(player.active);
    setAvatarUrl(player.avatarUrl);
    setAddress(player.address);
    setDominantFoot(player.dominantFoot);
    setPreferredPosition(player.preferredPosition);
    setEmergencyContact(player.health.emergencyContact);
    setHealthPlan(player.health.healthPlan);
    setBloodType(player.health.bloodType);
    setHealthIssues(player.health.healthIssues);
    setContinuousMedication(player.health.continuousMedication);
    setSelfSkills({ ...player.selfSkills });
    setAdminSkills({ ...player.adminSkills });
  }

  function closeModal() {
    setIsCreating(false);
    setEditingPlayer(null);
    setConfirmDelete(false);
    setFormError(null);
  }

  const canEditSelected =
    isCreating ||
    (editingPlayer ? isAdmin || editingPlayer.id === currentUser.id : false);

  async function handleQuickToggleRole(player: PlayerProfile) {
    if (!isAdmin) return;
    setPageError(null);
    setRoleQuickBusyId(player.id);
    try {
      const nextRole: UserRole = player.role === 'admin' ? 'player' : 'admin';
      await onUpdatePlayer(player.id, { role: nextRole });
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Erro ao alterar papel.');
    } finally {
      setRoleQuickBusyId(null);
    }
  }

  async function handleAvatarUpload(file: File | undefined) {
    if (!file) return;
    setFormError(null);
    try {
      const dataUrl = await compressImageFile(file, 480);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    }
  }

  async function handleAddExistingSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedExistingId) {
      setFormError('Selecione um peladeiro cadastrado.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onAddExistingMember(selectedExistingId, existingRole);
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao adicionar peladeiro.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!canEditSelected) return;
    setFormError(null);

    if (isCreating) {
      if (!/^[a-z0-9._-]{2,30}$/.test(username.trim().toLowerCase())) {
        setFormError('Login inválido (use 2 a 30 letras minúsculas ou números).');
        setModalTab('geral');
        return;
      }
      if (!/^\d{6}$/.test(pin.trim())) {
        setFormError('Informe uma senha numérica de 6 dígitos para o novo peladeiro.');
        setModalTab('geral');
        return;
      }
    } else if (pin.trim() !== '' && !/^\d{6}$/.test(pin.trim())) {
      setFormError('Se desejar alterar a senha, digite exatamente 6 dígitos numéricos.');
      setModalTab('geral');
      return;
    }

    if (name.trim().length < 2) {
      setFormError('Informe o nome completo do peladeiro.');
      setModalTab('geral');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        avatarUrl: avatarUrl.trim(),
        address: address.trim(),
        dominantFoot,
        preferredPosition,
        health: {
          emergencyContact: emergencyContact.trim(),
          healthPlan: healthPlan.trim(),
          bloodType,
          healthIssues: healthIssues.trim() || 'Nenhum',
          continuousMedication: continuousMedication.trim() || 'Nenhum',
        },
        selfSkills,
      };

      if (pin.trim()) {
        payload.pin = pin.trim();
      }
      if (isCreating) {
        payload.username = username.trim().toLowerCase();
      }
      if (isAdmin) {
        payload.role = role;
        payload.active = active;
        payload.adminSkills = adminSkills;
      }

      if (isCreating) {
        await onCreatePlayer(payload);
      } else if (editingPlayer) {
        await onUpdatePlayer(editingPlayer.id, payload);
      }
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar ficha.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingPlayer || !isAdmin) return;
    setSaving(true);
    setFormError(null);
    try {
      await onDeletePlayer(editingPlayer.id);
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao remover peladeiro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">
            Elenco & Saúde · {groupName}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Peladeiros desta pelada, administradores eleitos, notas oficiais e fichas médicas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openPlayerModal(currentUser)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Minha Ficha
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Peladeiro</span>
            </button>
          )}
        </div>
      </div>

      {/* Admins Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 text-xs text-slate-700">
          <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
          <p>
            <strong className="text-slate-900">Administradores desta pelada ({admins.length}):</strong>{' '}
            {admins.map((a) => a.name).join(', ')}
            {isAdmin && ' · Você pode eleger ou remover administradores clicando no botão de cada atleta ou editando sua ficha.'}
          </p>
        </div>
      </div>

      {pageError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {pageError}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar peladeiro por nome ou login..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por posição"
            value={positionFilter}
            onChange={(e) =>
              setPositionFilter(e.target.value as 'all' | FutsalPosition)
            }
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700"
          >
            <option value="all">Todas as posições</option>
            {POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>

          {isAdmin && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`min-h-[34px] px-3 text-xs font-medium rounded-lg cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Ativos
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`min-h-[34px] px-3 text-xs font-medium rounded-lg cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Todos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Player Grid */}
      {filteredPlayers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Nenhum peladeiro encontrado com esses filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPlayers.map((player) => {
            const st = stats[player.id];
            return (
              <div
                key={player.id}
                className={`bg-white border rounded-2xl p-5 flex flex-col justify-between gap-3 ${
                  player.active
                    ? 'border-slate-200'
                    : 'border-slate-200 opacity-65'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openPlayerModal(player)}
                  className="text-left w-full cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar
                        name={player.name}
                        src={player.avatarUrl}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <p className="text-base font-display font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                          {player.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          @{player.username}
                          <span aria-hidden="true"> · </span>
                          <span
                            className={
                              player.role === 'admin'
                                ? 'text-emerald-700 font-semibold'
                                : ''
                            }
                          >
                            {player.role === 'admin' ? 'Admin da Pelada' : 'Peladeiro'}
                          </span>
                          {!player.active && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-red-700 font-medium">
                                Inativo
                              </span>
                            </>
                          )}
                        </p>
                        <p className="text-xs font-medium text-slate-700 mt-1">
                          {player.preferredPosition} · {player.dominantFoot}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
                        {player.finalRating.toFixed(1)}
                      </p>
                      <p className="text-[11px] text-slate-500">Nota</p>
                    </div>
                  </div>
                </button>

                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
                  <span>
                    {st?.goals || 0}G · {st?.assists || 0}A · {st?.saves || 0}D
                  </span>

                  <div className="flex items-center gap-2 font-sans">
                    <span className="text-slate-500">
                      Sangue: <strong className="text-slate-800">{player.health.bloodType}</strong>
                    </span>
                    {isAdmin && player.id !== currentUser.id && player.active && (
                      <button
                        type="button"
                        disabled={roleQuickBusyId === player.id}
                        onClick={() => handleQuickToggleRole(player)}
                        className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                          player.role === 'admin'
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        {roleQuickBusyId === player.id
                          ? '...'
                          : player.role === 'admin'
                            ? 'Remover Admin'
                            : 'Eleger Admin'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Adicionar Peladeiro (Existente ou Novo) */}
      {isCreating && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900">
                  Adicionar Peladeiro · {groupName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inclua alguém já cadastrado no app ou crie um novo login.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={closeModal}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode switcher */}
            <div className="px-5 sm:px-6 pt-4 shrink-0">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAddMode('existing');
                    setFormError(null);
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    addMode === 'existing'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Já cadastrado ({availableUsers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode('new');
                    setFormError(null);
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    addMode === 'new'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar novo</span>
                </button>
              </div>
            </div>

            {addMode === 'existing' ? (
              <form
                onSubmit={handleAddExistingSubmit}
                className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4"
              >
                {availableUsers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Todos os usuários cadastrados na plataforma já participam desta pelada. Use a aba &ldquo;Cadastrar novo&rdquo; para criar um novo peladeiro.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Selecionar atleta
                      </label>
                      <select
                        value={selectedExistingId}
                        onChange={(e) => setSelectedExistingId(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                      >
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} (@{u.username}) · {u.preferredPosition}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Papel nesta pelada
                      </label>
                      <select
                        value={existingRole}
                        onChange={(e) => setExistingRole(e.target.value as UserRole)}
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                      >
                        <option value="player">Peladeiro</option>
                        <option value="admin">Administrador desta pelada</option>
                      </select>
                    </div>
                  </>
                )}

                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                    {formError}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  {availableUsers.length > 0 && (
                    <button
                      type="submit"
                      disabled={saving}
                      className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {saving ? 'Adicionando...' : 'Adicionar à Pelada'}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleSave}
                className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nome completo
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Login de acesso
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
                      }
                      placeholder="ex: carlos"
                      required
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Senha (6 dígitos)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      required
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-mono tracking-widest text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Papel nesta pelada
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white"
                    >
                      <option value="player">Peladeiro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Posição preferida
                    </label>
                    <select
                      value={preferredPosition}
                      onChange={(e) =>
                        setPreferredPosition(e.target.value as FutsalPosition)
                      }
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white"
                    >
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                    {formError}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {saving ? 'Salvando...' : 'Cadastrar na Pelada'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Ficha do Peladeiro Existente */}
      {!isCreating && editingPlayer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar
                  name={name || 'Peladeiro'}
                  src={avatarUrl}
                  size="md"
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-display font-bold text-slate-900 truncate">
                    {editingPlayer.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {canEditSelected
                      ? 'Modo de edição ativo'
                      : 'Visualização da ficha do colega'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar ficha"
                onClick={closeModal}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-5 sm:px-6 pt-3 border-b border-slate-200 flex items-center gap-1 shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setModalTab('geral')}
                className={`min-h-[44px] px-4 text-xs sm:text-sm font-semibold border-b-2 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  modalTab === 'geral'
                    ? 'border-emerald-700 text-emerald-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Geral & Futebol</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('saude')}
                className={`min-h-[44px] px-4 text-xs sm:text-sm font-semibold border-b-2 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  modalTab === 'saude'
                    ? 'border-emerald-700 text-emerald-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <HeartPulse className="w-4 h-4" />
                <span>Saúde & Emergência</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('habilidades')}
                className={`min-h-[44px] px-4 text-xs sm:text-sm font-semibold border-b-2 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  modalTab === 'habilidades'
                    ? 'border-emerald-700 text-emerald-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Habilidades</span>
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {modalTab === 'geral' && (
                <div className="space-y-4">
                  {/* Avatar Upload / URL */}
                  {canEditSelected && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-slate-100">
                      <label className="min-h-[44px] px-4 rounded-xl border border-dashed border-slate-300 hover:border-emerald-600 inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
                        <Upload className="w-4 h-4 text-emerald-700" />
                        <span>Enviar foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                        />
                      </label>
                      <input
                        type="url"
                        placeholder="Ou cole uma URL de imagem (https://...)"
                        value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        className="flex-1 h-11 px-3 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="text-xs text-red-600 font-medium px-2 min-h-[36px] cursor-pointer"
                        >
                          Remover foto
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nome completo
                      </label>
                      <input
                        type="text"
                        disabled={!canEditSelected}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Login de acesso
                      </label>
                      <input
                        type="text"
                        disabled
                        value={username}
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {canEditSelected && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {editingPlayer.id === currentUser.id && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Nova senha (6 dígitos, opcional)
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="Deixe vazio p/ manter"
                            value={pin}
                            onChange={(e) =>
                              setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-mono tracking-widest text-slate-900"
                          />
                        </div>
                      )}

                      {isAdmin && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Papel nesta pelada
                            </label>
                            <select
                              value={role}
                              onChange={(e) => setRole(e.target.value as UserRole)}
                              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white"
                            >
                              <option value="player">Peladeiro</option>
                              <option value="admin">Administrador desta pelada</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Situação nesta pelada
                            </label>
                            <select
                              value={active ? 'active' : 'inactive'}
                              onChange={(e) => setActive(e.target.value === 'active')}
                              className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white"
                            >
                              <option value="active">Ativo</option>
                              <option value="inactive">Desativado</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Endereço completo
                    </label>
                    <input
                      type="text"
                      disabled={!canEditSelected}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Rua, número, bairro, cidade - UF"
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Posição preferida
                      </label>
                      <select
                        disabled={!canEditSelected}
                        value={preferredPosition}
                        onChange={(e) =>
                          setPreferredPosition(e.target.value as FutsalPosition)
                        }
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white disabled:bg-slate-50"
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
                        disabled={!canEditSelected}
                        value={dominantFoot}
                        onChange={(e) =>
                          setDominantFoot(e.target.value as DominantFoot)
                        }
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white disabled:bg-slate-50"
                      >
                        {FEET.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'saude' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 flex items-start gap-2.5 text-xs text-slate-700">
                    <Activity className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <p>
                      Informações médicas ficam disponíveis para consulta rápida dos organizadores em caso de atendimento na quadra.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Contato de emergência (nome e telefone)
                      </label>
                      <input
                        type="text"
                        disabled={!canEditSelected}
                        value={emergencyContact}
                        onChange={(e) => setEmergencyContact(e.target.value)}
                        placeholder="ex: Maria · (11) 99999-0000"
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Tipo sanguíneo
                      </label>
                      <select
                        disabled={!canEditSelected}
                        value={bloodType}
                        onChange={(e) => setBloodType(e.target.value as BloodType)}
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white disabled:bg-slate-50"
                      >
                        {BLOOD_TYPES.map((bt) => (
                          <option key={bt} value={bt}>
                            {bt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Plano de Saúde
                    </label>
                    <input
                      type="text"
                      disabled={!canEditSelected}
                      value={healthPlan}
                      onChange={(e) => setHealthPlan(e.target.value)}
                      placeholder="ex: Bradesco Saúde, Unimed ou SUS"
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Problemas de saúde conhecidos / alergias
                    </label>
                    <textarea
                      rows={2}
                      disabled={!canEditSelected}
                      value={healthIssues}
                      onChange={(e) => setHealthIssues(e.target.value)}
                      placeholder="ex: Asma leve, alergia a dipirona, cirurgia no joelho..."
                      className="w-full p-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Remédios de uso contínuo
                    </label>
                    <textarea
                      rows={2}
                      disabled={!canEditSelected}
                      value={continuousMedication}
                      onChange={(e) => setContinuousMedication(e.target.value)}
                      placeholder="ex: Nenhum ou nome da medicação"
                      className="w-full p-3 rounded-xl border border-slate-300 text-sm text-slate-900 disabled:bg-slate-50"
                    />
                  </div>
                </div>
              )}

              {modalTab === 'habilidades' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Nota Final nesta pelada (usada no sorteio de times)
                      </p>
                      <p className="text-3xl font-display font-bold font-mono tabular-nums text-emerald-700 mt-1">
                        {avgSkill(adminSkills).toFixed(1)}{' '}
                        <span className="text-sm font-sans font-normal text-slate-500">
                          / 10
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Autoavaliação</p>
                      <p className="text-lg font-display font-bold font-mono tabular-nums text-slate-800">
                        {avgSkill(selfSkills).toFixed(1)}
                      </p>
                    </div>
                  </div>

                  {/* Autoavaliação */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Autoavaliação do Peladeiro (1 a 10)
                    </h3>
                    <div className="space-y-3">
                      {SKILL_FIELDS.map(({ key, label }) => (
                        <div
                          key={`self-${key}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <label className="text-xs sm:text-sm text-slate-700 w-44 shrink-0">
                            {label}
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={10}
                            step={1}
                            disabled={!canEditSelected}
                            value={selfSkills[key]}
                            onChange={(e) =>
                              setSelfSkills((prev) => ({
                                ...prev,
                                [key]: Number(e.target.value),
                              }))
                            }
                            className="flex-1 accent-slate-800"
                          />
                          <span className="w-8 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                            {selfSkills[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Revisão do Admin */}
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-700" />
                        <h3 className="text-sm font-bold text-slate-900">
                          Revisão Oficial do Administrador ({groupName})
                        </h3>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setAdminSkills({ ...selfSkills })}
                          className="min-h-[34px] px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                        >
                          Copiar autoavaliação
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {SKILL_FIELDS.map(({ key, label }) => (
                        <div
                          key={`admin-${key}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <label className="text-xs sm:text-sm text-slate-700 w-44 shrink-0">
                            {label}
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={10}
                            step={1}
                            disabled={!isAdmin}
                            value={adminSkills[key]}
                            onChange={(e) =>
                              setAdminSkills((prev) => ({
                                ...prev,
                                [key]: Number(e.target.value),
                              }))
                            }
                            className="flex-1 accent-emerald-700"
                          />
                          <span className="w-8 text-right font-mono tabular-nums text-sm font-bold text-emerald-700">
                            {adminSkills[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                  {formError}
                </div>
              )}

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {isAdmin &&
                    editingPlayer.id !== currentUser.id && (
                      confirmDelete ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={saving}
                            className="min-h-[40px] px-3 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirmar remoção
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Remover desta pelada</span>
                        </button>
                      )
                    )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer"
                  >
                    {canEditSelected ? 'Cancelar' : 'Fechar'}
                  </button>
                  {canEditSelected && (
                    <button
                      type="submit"
                      disabled={saving}
                      className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
