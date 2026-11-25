import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  Plus,
  Receipt,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceType,
  PlayerProfile,
} from '../types';
import {
  compressImageFile,
  formatBRL,
  formatDateBR,
} from '../utils/api';

const CATEGORIES: FinanceCategory[] = [
  'Mensalidade',
  'Diária Avulsa',
  'Aluguel de Quadra',
  'Material/Coletes',
  'Confraternização',
  'Outros',
];

interface FinanceViewProps {
  currentUser: PlayerProfile;
  entries: FinanceEntry[];
  onCreateEntry: (payload: {
    type: FinanceType;
    date: string;
    description: string;
    category: FinanceCategory;
    amount: number;
    receiptUrl?: string;
  }) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export function FinanceView({
  currentUser,
  entries,
  onCreateEntry,
  onDeleteEntry,
}: FinanceViewProps) {
  const isAdmin = currentUser.role === 'admin';

  const [typeFilter, setTypeFilter] = useState<'all' | FinanceType>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FinanceCategory>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<FinanceEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<FinanceType>('income');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FinanceCategory>('Mensalidade');
  const [amount, setAmount] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    let totalIncome = 0;
    let totalExpense = 0;
    let monthIncome = 0;
    let monthExpense = 0;

    for (const item of entries) {
      if (item.type === 'income') {
        totalIncome += item.amount;
        if (item.date.startsWith(currentMonth)) monthIncome += item.amount;
      } else {
        totalExpense += item.amount;
        if (item.date.startsWith(currentMonth)) monthExpense += item.amount;
      }
    }

    return {
      totalBalance: totalIncome - totalExpense,
      totalIncome,
      totalExpense,
      monthIncome,
      monthExpense,
      monthNet: monthIncome - monthExpense,
    };
  }, [entries]);

  // Monthly chart data (last 5 months)
  const monthlyChart = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const entry of entries) {
      const ym = entry.date.slice(0, 7);
      const curr = map.get(ym) || { income: 0, expense: 0 };
      if (entry.type === 'income') curr.income += entry.amount;
      else curr.expense += entry.amount;
      map.set(ym, curr);
    }
    const sortedKeys = Array.from(map.keys()).sort().slice(-5);
    const maxVal = Math.max(
      100,
      ...sortedKeys.map((k) => {
        const v = map.get(k)!;
        return Math.max(v.income, v.expense);
      }),
    );
    return {
      maxVal,
      bars: sortedKeys.map((ym) => {
        const [y, m] = ym.split('-');
        const label = `${m}/${y.slice(2)}`;
        const val = map.get(ym)!;
        return { ym, label, income: val.income, expense: val.expense };
      }),
    };
  }, [entries]);

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const totals = new Map<FinanceCategory, number>();
    let grandTotal = 0;
    for (const e of entries) {
      if (e.type !== 'expense') continue;
      totals.set(e.category, (totals.get(e.category) || 0) + e.amount);
      grandTotal += e.amount;
    }
    return {
      grandTotal,
      items: Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cat, val]) => ({
          category: cat,
          amount: val,
          percent: grandTotal > 0 ? Math.round((val / grandTotal) * 100) : 0,
        })),
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      return true;
    });
  }, [entries, typeFilter, categoryFilter]);

  async function handleReceiptUpload(file: File | undefined) {
    if (!file) return;
    setFormError(null);
    try {
      const compressed = await compressImageFile(file, 960);
      setReceiptUrl(compressed);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao anexar comprovante.');
    }
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!description.trim()) {
      setFormError('Informe a descrição do lançamento.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateEntry({
        type,
        date,
        description: description.trim(),
        category,
        amount: parsedAmount,
        receiptUrl: receiptUrl.trim() || undefined,
      });
      setDescription('');
      setAmount('');
      setReceiptUrl('');
      setShowCreateModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar lançamento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">
            Controle Financeiro
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Saldo da pelada, fluxo mensal, categorias e comprovantes anexados.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lançamento</span>
          </button>
        )}
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Saldo Total do Caixa</p>
          <p
            className={`mt-2 text-2xl sm:text-3xl font-display font-bold font-mono tabular-nums ${
              summary.totalBalance >= 0 ? 'text-slate-900' : 'text-red-700'
            }`}
          >
            {formatBRL(summary.totalBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Entradas {formatBRL(summary.totalIncome)} · Saídas {formatBRL(summary.totalExpense)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Entradas no Mês</p>
          <p className="mt-2 text-2xl sm:text-3xl font-display font-bold font-mono tabular-nums text-emerald-700">
            +{formatBRL(summary.monthIncome)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Mensalidades e diárias avulsas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Saídas no Mês</p>
          <p className="mt-2 text-2xl sm:text-3xl font-display font-bold font-mono tabular-nums text-red-700">
            -{formatBRL(summary.monthExpense)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Saldo mensal: {formatBRL(summary.monthNet)}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-display font-bold text-slate-900">
                Fluxo Mensal (Entradas vs Saídas)
              </h2>
              <p className="text-xs text-slate-500">
                Comparativo dos últimos meses registrados
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                Entradas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
                Saídas
              </span>
            </div>
          </div>

          {monthlyChart.bars.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-slate-500">
              Sem movimentações para exibir no gráfico.
            </div>
          ) : (
            <div className="h-48 flex items-end justify-around gap-3 pt-4 border-b border-slate-200">
              {monthlyChart.bars.map((bar) => {
                const inHeight = Math.max(
                  4,
                  Math.round((bar.income / monthlyChart.maxVal) * 140),
                );
                const outHeight = Math.max(
                  4,
                  Math.round((bar.expense / monthlyChart.maxVal) * 140),
                );
                return (
                  <div
                    key={bar.ym}
                    className="flex flex-col items-center gap-2 flex-1 max-w-[90px]"
                  >
                    <div className="w-full flex items-end justify-center gap-1.5 h-[144px]">
                      <div
                        title={`Entradas: ${formatBRL(bar.income)}`}
                        style={{ height: `${inHeight}px` }}
                        className="w-5 sm:w-7 rounded-t-md bg-emerald-600 transition-all"
                      />
                      <div
                        title={`Saídas: ${formatBRL(bar.expense)}`}
                        style={{ height: `${outHeight}px` }}
                        className="w-5 sm:w-7 rounded-t-md bg-red-500 transition-all"
                      />
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-600 pb-2">
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-display font-bold text-slate-900">
            Despesas por Categoria
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Distribuição acumulada de saídas
          </p>

          {expenseByCategory.items.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-slate-500">
              Nenhuma saída registrada.
            </div>
          ) : (
            <div className="space-y-3.5">
              {expenseByCategory.items.map((item) => (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {item.category}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {formatBRL(item.amount)} ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ledger / Movimentações */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <h2 className="text-lg font-display font-bold text-slate-900">
            Extrato de Movimentações
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['all', 'Todas'],
                  ['income', 'Entradas'],
                  ['expense', 'Saídas'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTypeFilter(val)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    typeFilter === val
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filtrar por categoria"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'all' | FinanceCategory)
              }
              className="min-h-[40px] px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="all">Todas as categorias</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Nenhuma movimentação encontrada para este filtro.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {entry.type === 'income' ? (
                      <ArrowUpCircle className="w-5 h-5 text-emerald-700" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-mono tabular-nums">
                        {formatDateBR(entry.date)}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>{entry.category}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{entry.type === 'income' ? 'Entrada' : 'Saída'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-8 sm:pl-0">
                  <span
                    className={`text-sm sm:text-base font-display font-bold font-mono tabular-nums ${
                      entry.type === 'income' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {entry.type === 'income' ? '+' : '-'}
                    {formatBRL(entry.amount)}
                  </span>

                  {entry.receiptUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewReceipt(entry)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Comprovante</span>
                    </button>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {confirmDeleteId === entry.id ? (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteEntry(entry.id);
                              setConfirmDeleteId(null);
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label="Excluir lançamento"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Novo Lançamento */}
      {showCreateModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-display font-bold text-slate-900">
                Novo Lançamento Financeiro
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
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    type === 'income'
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Entrada (+)
                </button>
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    type === 'expense'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Saída (-)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-mono tabular-nums text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FinanceCategory)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  maxLength={160}
                  placeholder="ex: Pagamento mensalidade João ou Aluguel quadra"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Comprovante (opcional · imagem ou URL)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="min-h-[44px] px-4 rounded-xl border border-dashed border-slate-300 hover:border-emerald-600 flex items-center justify-center gap-2 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
                    <Upload className="w-4 h-4 text-emerald-700" />
                    <span>Enviar foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleReceiptUpload(e.target.files?.[0])}
                    />
                  </label>
                  <input
                    type="url"
                    placeholder="Ou cole a URL da imagem do comprovante"
                    value={receiptUrl.startsWith('data:') ? '' : receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    className="flex-1 h-11 px-3 rounded-xl border border-slate-300 text-xs text-slate-900"
                  />
                </div>
                {receiptUrl && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                    <Receipt className="w-4 h-4" />
                    <span>Comprovante anexado</span>
                    <button
                      type="button"
                      onClick={() => setReceiptUrl('')}
                      className="text-red-600 underline ml-2 cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>

              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                  {formError}
                </div>
              )}

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
                  disabled={submitting}
                  className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Salvando...' : 'Salvar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Visualizador de Comprovante */}
      {previewReceipt && previewReceipt.receiptUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {previewReceipt.description}
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {formatDateBR(previewReceipt.date)} · {formatBRL(previewReceipt.amount)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar comprovante"
                onClick={() => setPreviewReceipt(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewReceipt.receiptUrl}
                alt={`Comprovante de ${previewReceipt.description}`}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[68vh] rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
