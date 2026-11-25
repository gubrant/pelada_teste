import { useState } from 'react';
import { Check, Clock, Shield, X } from 'lucide-react';
import type { GroupSummary, PendingUserSummary, UserRole } from '../types';
import { formatDateBR } from '../utils/api';
import { WEEKDAY_NAMES } from '../utils/peladaTime';

interface PendingApprovalsSectionProps {
  pendingUsers: PendingUserSummary[];
  adminGroups: GroupSummary[];
  defaultGroupId?: string;
  onApprove: (userId: string, groupIds: string[], role: UserRole) => Promise<void>;
  onReject: (userId: string) => Promise<void>;
}

export function PendingApprovalsSection({
  pendingUsers,
  adminGroups,
  defaultGroupId,
  onApprove,
  onReject,
}: PendingApprovalsSectionProps) {
  const [selectedGroupsByUser, setSelectedGroupsByUser] = useState<
    Record<string, string[]>
  >({});
  const [roleByUser, setRoleByUser] = useState<Record<string, UserRole>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pendingUsers.length === 0 || adminGroups.length === 0) {
    return null;
  }

  function getSelectedGroups(user: PendingUserSummary): string[] {
    if (selectedGroupsByUser[user.id]) {
      return selectedGroupsByUser[user.id];
    }
    const adminIds = new Set(adminGroups.map((g) => g.id));
    const matchingRequested = user.requestedGroupIds.filter((gid) =>
      adminIds.has(gid),
    );
    if (matchingRequested.length > 0) return matchingRequested;
    if (defaultGroupId && adminIds.has(defaultGroupId)) return [defaultGroupId];
    return adminGroups[0] ? [adminGroups[0].id] : [];
  }

  function toggleGroupForUser(user: PendingUserSummary, gid: string) {
    const current = getSelectedGroups(user);
    const next = current.includes(gid)
      ? current.filter((id) => id !== gid)
      : [...current, gid];
    setSelectedGroupsByUser((prev) => ({ ...prev, [user.id]: next }));
  }

  async function handleApprove(user: PendingUserSummary) {
    const groupIds = getSelectedGroups(user);
    if (groupIds.length === 0) {
      setError('Selecione pelo menos uma pelada para aprovar o cadastro.');
      return;
    }
    setError(null);
    setBusyUserId(user.id);
    try {
      await onApprove(user.id, groupIds, roleByUser[user.id] || 'player');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar cadastro.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleReject(userId: string) {
    setError(null);
    setBusyUserId(userId);
    try {
      await onReject(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recusar solicitação.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base sm:text-lg font-display font-bold text-slate-900">
              Cadastros Aguardando Aprovação ({pendingUsers.length})
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Aprove novos peladeiros que solicitaram acesso na tela inicial e indique de qual pelada fixa eles farão parte.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        {pendingUsers.map((user) => {
          const selected = getSelectedGroups(user);
          const selectedRole = roleByUser[user.id] || 'player';
          const isBusy = busyUserId === user.id;

          return (
            <div
              key={user.id}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-base font-display font-bold text-slate-900">
                    {user.name}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    @{user.username}
                    <span aria-hidden="true"> · </span>
                    {user.preferredPosition}
                    <span aria-hidden="true"> · </span>
                    {user.dominantFoot}
                    <span aria-hidden="true"> · </span>
                    Pedido em {formatDateBR(user.createdAt.slice(0, 10))}
                  </p>
                  {user.requestedGroupNames.length > 0 && (
                    <p className="text-xs text-emerald-800 font-medium mt-1">
                      Interesse informado: {user.requestedGroupNames.join(', ')}
                    </p>
                  )}
                  {user.requestedNotes && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Obs.: &ldquo;{user.requestedNotes}&rdquo;
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <select
                    aria-label={`Papel de ${user.name}`}
                    value={selectedRole}
                    disabled={isBusy}
                    onChange={(e) =>
                      setRoleByUser((prev) => ({
                        ...prev,
                        [user.id]: e.target.value as UserRole,
                      }))
                    }
                    className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                  >
                    <option value="player">Aprovar como Peladeiro</option>
                    <option value="admin">Aprovar como Administrador</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Indicar pelada(s) fixa(s) para este peladeiro:</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {adminGroups.map((grp) => {
                    const checked = selected.includes(grp.id);
                    return (
                      <label
                        key={grp.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'border-emerald-600 bg-emerald-50/70'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isBusy}
                          checked={checked}
                          onChange={() => toggleGroupForUser(user, grp.id)}
                          className="w-4 h-4 accent-emerald-700"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
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

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleReject(user.id)}
                  className="min-h-[42px] px-4 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <X className="w-4 h-4" />
                  <span>Recusar</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleApprove(user)}
                  className="min-h-[42px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>{isBusy ? 'Processando...' : 'Aprovar e Indicar Pelada'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
