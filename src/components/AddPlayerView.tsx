import { useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  HeartPulse,
  KeyRound,
  RefreshCw,
  Shield,
  Sliders,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AvailableUserOption,
  BloodType,
  DominantFoot,
  FutsalPosition,
  GroupSummary,
  PendingUserSummary,
  SkillRatings,
  UserRole,
} from '../types';
import { compressImageFile } from '../utils/api';
import { PendingApprovalsSection } from './PendingApprovalsSection';
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

function generateSixDigitPin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

interface AddPlayerViewProps {
  groupId: string;
  groupName: string;
  availableUsers: AvailableUserOption[];
  pendingUsers: PendingUserSummary[];
  adminGroups: GroupSummary[];
  onCreatePlayer: (payload: Record<string, unknown>) => Promise<void>;
  onAddExistingMember: (existingUserId: string, role: UserRole) => Promise<void>;
  onApprovePendingUser: (
    userId: string,
    groupIds: string[],
    role: UserRole,
  ) => Promise<void>;
  onRejectPendingUser: (userId: string) => Promise<void>;
  onGoToRoster: () => void;
}

type Mode = 'new' | 'existing';

interface CreatedCredentials {
  name: string;
  username: string;
  pin: string;
  role: UserRole;
}

export function AddPlayerView({
  groupId,
  groupName,
  availableUsers,
  pendingUsers,
  adminGroups,
  onCreatePlayer,
  onAddExistingMember,
  onApprovePendingUser,
  onRejectPendingUser,
  onGoToRoster,
}: AddPlayerViewProps) {
  const [mode, setMode] = useState<Mode>('new');

  // New player form state
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(true);
  const [role, setRole] = useState<UserRole>('player');
  const [preferredPosition, setPreferredPosition] =
    useState<FutsalPosition>('Ala Direito');
  const [dominantFoot, setDominantFoot] = useState<DominantFoot>('Destro');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [address, setAddress] = useState('');

  // Optional collapsible sections
  const [showHealth, setShowHealth] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [healthPlan, setHealthPlan] = useState('');
  const [bloodType, setBloodType] = useState<BloodType>('Não informado');
  const [healthIssues, setHealthIssues] = useState('');
  const [continuousMedication, setContinuousMedication] = useState('');

  const [showSkills, setShowSkills] = useState(false);
  const [skills, setSkills] = useState<SkillRatings>({
    habilidade: 7,
    preparoFisico: 7,
    chute: 7,
    defesa: 7,
    ataque: 7,
  });

  // Existing user link state
  const [selectedExistingId, setSelectedExistingId] = useState(
    availableUsers[0]?.id || '',
  );
  const [existingRole, setExistingRole] = useState<UserRole>('player');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<CreatedCredentials | null>(null);
  const [addedExistingMessage, setAddedExistingMessage] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!usernameEdited) {
      const suggested = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '.')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 24);
      setUsername(suggested);
    }
  }

  async function handleAvatarUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await compressImageFile(file, 480);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    }
  }

  async function handleCopyCredentials(creds: CreatedCredentials) {
    const text = `Acesso à pelada "${groupName}" no QuadraLivre:\nLogin: ${creds.username}\nSenha: ${creds.pin}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedInfo(null);

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (cleanName.length < 2) {
      setError('Informe o nome completo do peladeiro.');
      return;
    }
    if (!/^[a-z0-9._-]{2,30}$/.test(cleanUsername)) {
      setError(
        'Login inválido. Use de 2 a 30 caracteres (letras minúsculas, números, ponto ou underline).',
      );
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      setError('A senha deve conter exatamente 6 dígitos numéricos.');
      return;
    }

    setSaving(true);
    try {
      await onCreatePlayer({
        name: cleanName,
        username: cleanUsername,
        pin: cleanPin,
        role,
        active: true,
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
        selfSkills: skills,
        adminSkills: skills,
      });

      setCreatedInfo({
        name: cleanName,
        username: cleanUsername,
        pin: cleanPin,
        role,
      });

      // Reset form for quick consecutive entries
      setName('');
      setUsername('');
      setUsernameEdited(false);
      setPin('');
      setRole('player');
      setAvatarUrl('');
      setAddress('');
      setEmergencyContact('');
      setHealthPlan('');
      setBloodType('Não informado');
      setHealthIssues('');
      setContinuousMedication('');
      setSkills({
        habilidade: 7,
        preparoFisico: 7,
        chute: 7,
        defesa: 7,
        ataque: 7,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao cadastrar peladeiro.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddExistingSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAddedExistingMessage(null);

    const targetId = selectedExistingId || availableUsers[0]?.id;
    if (!targetId) {
      setError('Selecione um peladeiro já cadastrado.');
      return;
    }

    const chosenUser = availableUsers.find((u) => u.id === targetId);
    setSaving(true);
    try {
      await onAddExistingMember(targetId, existingRole);
      setAddedExistingMessage(
        `${chosenUser?.name || 'Peladeiro'} foi adicionado(a) à pelada "${groupName}".`,
      );
      const remaining = availableUsers.filter((u) => u.id !== targetId);
      setSelectedExistingId(remaining[0]?.id || '');
      setExistingRole('player');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao adicionar peladeiro.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">
            Adicionar Peladeiro · {groupName}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Cadastre novos atletas criando login e senha de acesso ou inclua quem já usa o aplicativo.
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToRoster}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Users className="w-4 h-4 text-emerald-700" />
          <span>Ver Elenco</span>
        </button>
      </div>

      {pendingUsers.length > 0 && adminGroups.length > 0 && (
        <PendingApprovalsSection
          pendingUsers={pendingUsers}
          adminGroups={adminGroups}
          defaultGroupId={groupId}
          onApprove={onApprovePendingUser}
          onReject={onRejectPendingUser}
        />
      )}

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-white border border-slate-200 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setMode('new');
            setError(null);
          }}
          className={`min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            mode === 'new'
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <UserPlus className="w-4 h-4 shrink-0" />
          <span className="truncate">Criar Login e Senha</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('existing');
            setError(null);
            if (!selectedExistingId && availableUsers[0]) {
              setSelectedExistingId(availableUsers[0].id);
            }
          }}
          className={`min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            mode === 'existing'
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <UserCheck className="w-4 h-4 shrink-0" />
          <span className="truncate">
            Já Cadastrado ({availableUsers.length})
          </span>
        </button>
      </div>

      {/* Feedback messages */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {createdInfo && mode === 'new' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-display font-bold text-emerald-950 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-700" />
              <span>{createdInfo.name} cadastrado(a) com sucesso!</span>
            </p>
            <p className="text-xs text-emerald-900 font-mono tabular-nums">
              Login: <strong>{createdInfo.username}</strong> · Senha:{' '}
              <strong>{createdInfo.pin}</strong> · Papel:{' '}
              {createdInfo.role === 'admin' ? 'Administrador' : 'Peladeiro'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyCredentials(createdInfo)}
              className="min-h-[40px] px-3.5 rounded-xl bg-white border border-emerald-300 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Copiado!' : 'Copiar acesso'}</span>
            </button>
            <button
              type="button"
              onClick={onGoToRoster}
              className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white cursor-pointer"
            >
              Ver no Elenco
            </button>
          </div>
        </div>
      )}

      {addedExistingMessage && mode === 'existing' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm font-medium text-emerald-900 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{addedExistingMessage}</span>
          </p>
          <button
            type="button"
            onClick={onGoToRoster}
            className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white shrink-0 cursor-pointer"
          >
            Ver no Elenco
          </button>
        </div>
      )}

      {mode === 'new' ? (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6"
        >
          {/* Section 1: Login & Password */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-display font-bold text-slate-900">
                Credenciais de Acesso do Peladeiro
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="add-player-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nome completo *
                </label>
                <input
                  id="add-player-name"
                  type="text"
                  required
                  placeholder="ex: Carlos Eduardo Silva"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label
                  htmlFor="add-player-username"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Login de acesso *
                </label>
                <input
                  id="add-player-username"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="ex: carlos.silva"
                  value={username}
                  onChange={(e) => {
                    setUsernameEdited(true);
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
                    );
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Letras minúsculas, números, ponto ou underline (2 a 30 caracteres).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="add-player-pin"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Senha numérica (6 dígitos) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPin(generateSixDigitPin());
                      setShowPin(true);
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Gerar senha</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="add-player-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
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
                <label
                  htmlFor="add-player-role"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Papel nesta pelada
                </label>
                <select
                  id="add-player-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="player">Peladeiro</option>
                  <option value="admin">Administrador desta pelada</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Quadra & Perfil */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h2 className="text-base font-display font-bold text-slate-900">
              Perfil em Quadra
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="add-player-pos"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Posição preferida
                </label>
                <select
                  id="add-player-pos"
                  value={preferredPosition}
                  onChange={(e) =>
                    setPreferredPosition(e.target.value as FutsalPosition)
                  }
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                >
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="add-player-foot"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Pé dominante
                </label>
                <select
                  id="add-player-foot"
                  value={dominantFoot}
                  onChange={(e) =>
                    setDominantFoot(e.target.value as DominantFoot)
                  }
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                >
                  {FEET.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label
                  htmlFor="add-player-address"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Endereço (opcional)
                </label>
                <input
                  id="add-player-address"
                  type="text"
                  placeholder="Rua, bairro, cidade"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="flex items-center gap-3">
                <PlayerAvatar name={name || 'Novo'} src={avatarUrl} size="md" />
                <label className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-dashed border-slate-300 hover:border-emerald-600 inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <Upload className="w-4 h-4 text-emerald-700" />
                  <span>{avatarUrl ? 'Trocar foto' : 'Enviar foto (opcional)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                  />
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="text-xs font-medium text-red-600 px-2 min-h-[40px] cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Optional Collapsible: Saúde & Emergência */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHealth((v) => !v)}
              className="w-full min-h-[48px] px-4 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <HeartPulse className="w-4 h-4 text-emerald-700" />
                <span>Ficha de Saúde & Emergência (opcional)</span>
              </span>
              {showHealth ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showHealth && (
              <div className="p-4 space-y-4 bg-white border-t border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tipo Sanguíneo
                    </label>
                    <select
                      value={bloodType}
                      onChange={(e) => setBloodType(e.target.value as BloodType)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                    >
                      {BLOOD_TYPES.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Contato de emergência
                    </label>
                    <input
                      type="text"
                      placeholder="Nome e telefone"
                      value={emergencyContact}
                      onChange={(e) => setEmergencyContact(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Plano de saúde
                  </label>
                  <input
                    type="text"
                    placeholder="Convênio ou SUS"
                    value={healthPlan}
                    onChange={(e) => setHealthPlan(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Problemas de saúde conhecidos
                    </label>
                    <input
                      type="text"
                      placeholder="Nenhum"
                      value={healthIssues}
                      onChange={(e) => setHealthIssues(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Remédios de uso contínuo
                    </label>
                    <input
                      type="text"
                      placeholder="Nenhum"
                      value={continuousMedication}
                      onChange={(e) => setContinuousMedication(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Optional Collapsible: Habilidades Iniciais */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSkills((v) => !v)}
              className="w-full min-h-[48px] px-4 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Sliders className="w-4 h-4 text-emerald-700" />
                <span>
                  Avaliação Inicial de Habilidades (Nota:{' '}
                  <strong className="font-mono tabular-nums text-emerald-700">
                    {avgSkill(skills).toFixed(1)}
                  </strong>
                  )
                </span>
              </span>
              {showSkills ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showSkills && (
              <div className="p-4 space-y-3 bg-white border-t border-slate-200">
                {SKILL_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="font-mono font-bold tabular-nums text-emerald-700">
                        {skills[key]}/10
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={skills[key]}
                      onChange={(e) =>
                        setSkills((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-700 h-2 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-2.5 text-xs text-slate-600">
            <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p>
              Após cadastrar, o peladeiro já poderá acessar o aplicativo usando o{' '}
              <strong>login</strong> e a <strong>senha de 6 dígitos</strong> definidos acima e confirmar presença nos próximos jogos de {groupName}.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] w-full sm:w-auto px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {saving
                  ? 'Cadastrando...'
                  : 'Cadastrar Peladeiro com Login e Senha'}
              </span>
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleAddExistingSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-5"
        >
          {availableUsers.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-600">
                Todos os usuários cadastrados na plataforma já fazem parte desta pelada.
              </p>
              <button
                type="button"
                onClick={() => setMode('new')}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Criar novo peladeiro com login e senha</span>
              </button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-base font-display font-bold text-slate-900">
                  Vincular Usuário Já Cadastrado
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Escolha um peladeiro que já possui conta no QuadraLivre para entrar em {groupName}.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="existing-user-select"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Selecionar atleta
                  </label>
                  <select
                    id="existing-user-select"
                    value={selectedExistingId}
                    onChange={(e) => setSelectedExistingId(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                  >
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (@{u.username}) · {u.preferredPosition}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="existing-user-role"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Papel nesta pelada
                  </label>
                  <select
                    id="existing-user-role"
                    value={existingRole}
                    onChange={(e) => setExistingRole(e.target.value as UserRole)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                  >
                    <option value="player">Peladeiro</option>
                    <option value="admin">Administrador desta pelada</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[48px] w-full sm:w-auto px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{saving ? 'Adicionando...' : 'Adicionar à Pelada'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
