export type UserRole = 'admin' | 'player';

export type DominantFoot = 'Destro' | 'Canhoto' | 'Ambidestro';

export type FutsalPosition =
  | 'Goleiro'
  | 'Fixo'
  | 'Ala Esquerdo'
  | 'Ala Direito'
  | 'Pivô';

export type BloodType =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'Não informado';

export interface SkillRatings {
  habilidade: number;
  preparoFisico: number;
  chute: number;
  defesa: number;
  ataque: number;
}

export interface HealthInfo {
  emergencyContact: string;
  healthPlan: string;
  bloodType: BloodType;
  healthIssues: string;
  continuousMedication: string;
}

export interface PlayerProfile {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  avatarUrl: string;
  address: string;
  dominantFoot: DominantFoot;
  preferredPosition: FutsalPosition;
  health: HealthInfo;
  selfSkills: SkillRatings;
  adminSkills: SkillRatings;
  finalRating: number;
  adminReviewed: boolean;
  createdAt: string;
}

export type FinanceType = 'income' | 'expense';

export type FinanceCategory =
  | 'Mensalidade'
  | 'Diária Avulsa'
  | 'Aluguel de Quadra'
  | 'Material/Coletes'
  | 'Confraternização'
  | 'Outros';

export interface FinanceEntry {
  id: string;
  type: FinanceType;
  date: string;
  description: string;
  category: FinanceCategory;
  amount: number;
  receiptUrl?: string;
  createdBy: string;
  createdAt: string;
}

export type TeamColor = 'emerald' | 'amber' | 'slate' | 'rose';

export interface TeamRoster {
  id: string;
  name: string;
  color: TeamColor;
  playerIds: string[];
}

export type MatchEventType = 'goal' | 'assist' | 'save';

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  teamId: string;
  playerId: string;
  assistPlayerId?: string;
  minute: number;
  createdAt: string;
}

export interface LiveMatchState {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isRunning: boolean;
  elapsedSeconds: number;
  lastStartedAt?: number;
  events: MatchEvent[];
}

export interface PostMatchVote {
  voterId: string;
  targetPlayerId: string;
  createdAt: string;
}

export type PeladaStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

export interface RecurringPeladaRule {
  id: string;
  title: string;
  dayOfWeek: number; // 0 = Domingo ... 6 = Sábado
  time: string;
  location: string;
  teamCount: number;
  playersPerTeam: number;
  active: boolean;
  createdAt: string;
}

export interface PeladaSession {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  teamCount: number;
  playersPerTeam: number;
  status: PeladaStatus;
  presentPlayerIds: string[];
  teams: TeamRoster[];
  adjustmentNote?: string;
  live: LiveMatchState;
  votes: PostMatchVote[];
  recurringRuleId?: string;
  scheduledAt?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  createdAt: string;
}

export interface PlayerStatsSummary {
  playerId: string;
  goals: number;
  assists: number;
  saves: number;
  matchesAttended: number;
  craqueVotes: number;
  craqueTitles: number;
}
