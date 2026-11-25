import type { PeladaSession } from '../types';

export const WEEKDAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

export function getMatchStartMs(
  pelada: Pick<PeladaSession, 'date' | 'time' | 'scheduledAt'>,
): number {
  if (pelada.scheduledAt) {
    const parsedIso = Date.parse(pelada.scheduledAt);
    if (Number.isFinite(parsedIso)) return parsedIso;
  }
  const localIso = `${pelada.date}T${pelada.time}:00`;
  const parsed = new Date(localIso).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function getAttendanceDeadlineMs(
  pelada: Pick<PeladaSession, 'date' | 'time' | 'scheduledAt'>,
): number {
  return getMatchStartMs(pelada) - 60 * 60 * 1000;
}

export function formatTimeFromMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDeadlineCountdown(deadlineMs: number, nowMs = Date.now()): string {
  const diff = deadlineMs - nowMs;
  if (diff <= 0) return 'Prazo encerrado';
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h restantes`;
  if (hours > 0) return `${hours}h ${mins}min restantes`;
  return `${Math.max(1, mins)}min restantes`;
}
