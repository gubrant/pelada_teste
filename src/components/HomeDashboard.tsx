import { useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  Check,
  MapPin,
  Radio,
  Trophy,
  Users,
  Vote,
  Wallet,
} from 'lucide-react';
import type {
  FinanceEntry,
  PeladaSession,
  PlayerProfile,
  PlayerStatsSummary,
} from '../types';
import { formatBRL, formatDateBR } from '../utils/api';
import { PlayerAvatar } from './PlayerAvatar';

export type AppTab = 'home' | 'pelada' | 'live' | 'players' | 'finance';

interface HomeDashboardProps {
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  peladas: PeladaSession[];
  finance: FinanceEntry[];
  stats: Record<string, PlayerStatsSummary>;
  onNavigate: (tab: AppTab, peladaId?: string) => void;
  onToggleAttendance: (peladaId: string) => Promise<void>;
}

export function HomeDashboard({
  currentUser,
  players,
  peladas,
  finance,
  stats,
  onNavigate,
  onToggleAttendance,
}: HomeDashboardProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [togglingAttendance, setTogglingAttendance] = useState(false);

  const activePlayers = players.filter((p) => p.active);
  const nextPelada =
    peladas.find((p) => p.status === 'live') ||
    peladas.find((p) => p.status === 'scheduled') ||
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

  async function handleToggleSelfAttendance() {
    if (!nextPelada || togglingAttendance) return;
    setTogglingAttendance(true);
    try {
      await onToggleAttendance(nextPelada.id);
    } finally {
      setTogglingAttendance(false);
    }
  }

  return (
    <div className="space-y-6">
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
              {nextPelada ? nextPelada.title : 'Nenhuma pelada agendada'}
            </h1>

            {nextPelada && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-200">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{nextPelada.location}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{nextPelada.presentPlayerIds.length} confirmados</span>
                </span>
              </div>
            )}
          </div>

          {nextPelada && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {nextPelada.status === 'scheduled' && (
                <button
                  type="button"
                  onClick={handleToggleSelfAttendance}
                  disabled={togglingAttendance}
                  className={`min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isAttendingNext
                      ? 'bg-white text-slate-900 hover:bg-slate-100'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isAttendingNext ? 'Presença confirmada' : 'Confirmar presença'}
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

      {/* Two-column body: Artilharia & Finanças + Votação */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900">
                Destaques da Temporada
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ranking somado das peladas concluídas e em andamento
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
                <p className="text-[11px] text-slate-500">Nota Oficial</p>
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
    </div>
  );
}
