import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  FinanceEntry,
  GroupMember,
  PeladaGroup,
  PeladaSession,
  PlayerProfile,
  SkillRatings,
  TeamColor,
  TeamRoster,
} from '../src/types.ts';
import { hashPin } from './auth.ts';

export interface StoredUser extends PlayerProfile {
  pinHash: string;
  pinSalt: string;
}

export interface AppDatabase {
  schemaVersion: number;
  users: StoredUser[];
  groups: PeladaGroup[];
  finance: FinanceEntry[];
  peladas: PeladaSession[];
}

export function computeFinalRating(skills: SkillRatings): number {
  const sum =
    skills.habilidade +
    skills.preparoFisico +
    skills.chute +
    skills.defesa +
    skills.ataque;
  return Math.round((sum / 5) * 10) / 10;
}

export function sanitizeUser(user: StoredUser): PlayerProfile {
  const { pinHash: _hash, pinSalt: _salt, ...safe } = user;
  return safe;
}

export function getGroupMemberProfiles(
  db: AppDatabase,
  group: PeladaGroup,
): PlayerProfile[] {
  const userMap = new Map(db.users.map((u) => [u.id, u]));
  const result: PlayerProfile[] = [];
  for (const member of group.members) {
    const user = userMap.get(member.playerId);
    if (!user) continue;
    const base = sanitizeUser(user);
    result.push({
      ...base,
      role: member.role,
      active: user.active && member.active,
      adminSkills: member.adminSkills,
      finalRating: member.finalRating,
      adminReviewed: member.adminReviewed,
    });
  }
  return result;
}

export interface DrawResult {
  teams: TeamRoster[];
  effectiveTeamCount: number;
  adjustmentNote?: string;
}

export function drawBalancedTeams(
  players: PlayerProfile[],
  teamCount: number,
  playersPerTeam = 5,
): DrawResult {
  const requestedTeams = Math.max(2, Math.min(6, Math.floor(teamCount) || 2));
  const perTeam = Math.max(3, Math.min(10, Math.floor(playersPerTeam) || 5));

  let effectiveTeamCount = requestedTeams;
  if (players.length >= 4 && players.length < requestedTeams * 2) {
    effectiveTeamCount = Math.max(2, Math.floor(players.length / 2));
  }

  const labels = ['Time A', 'Time B', 'Time C', 'Time D', 'Time E', 'Time F'];
  const colors: TeamColor[] = ['emerald', 'amber', 'slate', 'rose', 'emerald', 'amber'];

  const teams: {
    id: string;
    name: string;
    color: TeamColor;
    playerIds: string[];
    ratingSum: number;
  }[] = Array.from({ length: effectiveTeamCount }, (_, idx) => ({
    id: `team-${String.fromCharCode(97 + idx)}`,
    name: labels[idx],
    color: colors[idx],
    playerIds: [],
    ratingSum: 0,
  }));

  const shuffleWithinRating = (list: PlayerProfile[]) =>
    [...list].sort((a, b) => {
      const diff = b.finalRating - a.finalRating;
      if (Math.abs(diff) > 0.05) return diff;
      return Math.random() - 0.5;
    });

  const goalkeepers = shuffleWithinRating(
    players.filter((p) => p.preferredPosition === 'Goleiro'),
  );
  const outfielders = shuffleWithinRating(
    players.filter((p) => p.preferredPosition !== 'Goleiro'),
  );

  const assignPlayer = (player: PlayerProfile) => {
    const sortedTeams = [...teams].sort((a, b) => {
      if (a.playerIds.length !== b.playerIds.length) {
        return a.playerIds.length - b.playerIds.length;
      }
      return a.ratingSum - b.ratingSum;
    });
    const target = sortedTeams[0];
    target.playerIds.push(player.id);
    target.ratingSum += player.finalRating;
  };

  goalkeepers.forEach(assignPlayer);
  outfielders.forEach(assignPlayer);

  const expectedTotal = requestedTeams * perTeam;
  let adjustmentNote: string | undefined;

  if (players.length > 0) {
    const countsSummary = teams
      .map((t) => `${t.name} (${t.playerIds.length})`)
      .join(', ');

    if (effectiveTeamCount !== requestedTeams) {
      adjustmentNote = `Apenas ${players.length} confirmados para ${requestedTeams} times de ${perTeam}. Ajuste automático para ${effectiveTeamCount} times: ${countsSummary}.`;
    } else if (players.length < expectedTotal) {
      adjustmentNote = `${players.length} confirmados para ${expectedTotal} vagas (${requestedTeams}×${perTeam}). Ajuste automático aplicado: ${countsSummary}.`;
    } else if (players.length > expectedTotal) {
      adjustmentNote = `${players.length} confirmados superam ${expectedTotal} vagas (${requestedTeams}×${perTeam}). Todos foram distribuídos: ${countsSummary}.`;
    }
  }

  return {
    teams: teams.map(({ id, name, color, playerIds }) => ({
      id,
      name,
      color,
      playerIds,
    })),
    effectiveTeamCount,
    adjustmentNote,
  };
}

function resolveDataFile(): string {
  const preferTmp = Boolean(process.env.VERCEL);
  const baseDir = preferTmp ? '/tmp' : path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    return path.join(baseDir, 'quadralivre.json');
  } catch {
    return path.join('/tmp', 'quadralivre.json');
  }
}

function getInitialPin(): string {
  const envPin = process.env.INITIAL_ADMIN_PIN?.trim();
  if (envPin && /^\d{6}$/.test(envPin)) return envPin;
  return '123456';
}

function formatDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function formatMonthOffset(monthsOffset: number, day: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsOffset);
  d.setDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}

function createSeedUser(
  partial: Omit<
    PlayerProfile,
    'finalRating' | 'createdAt' | 'active' | 'adminReviewed'
  > & { active?: boolean; adminReviewed?: boolean; pin: string },
): StoredUser {
  const { pin, ...rest } = partial;
  const { hash, salt } = hashPin(pin);
  return {
    ...rest,
    active: partial.active ?? true,
    adminReviewed: partial.adminReviewed ?? true,
    finalRating: computeFinalRating(partial.adminSkills),
    createdAt: new Date().toISOString(),
    pinHash: hash,
    pinSalt: salt,
  };
}

function toGroupMember(user: StoredUser, roleOverride?: 'admin' | 'player'): GroupMember {
  return {
    playerId: user.id,
    role: roleOverride || user.role,
    active: user.active,
    adminSkills: { ...user.adminSkills },
    finalRating: user.finalRating,
    adminReviewed: user.adminReviewed,
    joinedAt: user.createdAt,
  };
}

function createInitialSeed(): AppDatabase {
  const defaultPin = getInitialPin();

  const users: StoredUser[] = [
    createSeedUser({
      id: 'usr-didi',
      username: 'didi',
      name: 'Didi Silva',
      role: 'admin',
      avatarUrl: '/src/assets/images/avatar_didi_1795567439459.jpg',
      address: 'Rua das Acácias, 240 — Vila Olímpia, São Paulo - SP',
      dominantFoot: 'Destro',
      preferredPosition: 'Ala Direito',
      health: {
        emergencyContact: 'Camila Silva · (11) 99812-4410',
        healthPlan: 'Bradesco Saúde Top',
        bloodType: 'O+',
        healthIssues: 'Nenhuma restrição relatada',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 9, preparoFisico: 8, chute: 8, defesa: 7, ataque: 9 },
      adminSkills: { habilidade: 9, preparoFisico: 8, chute: 8, defesa: 7, ataque: 9 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-mario',
      username: 'mario',
      name: 'Mário Costa',
      role: 'admin',
      avatarUrl: '/src/assets/images/avatar_mario_1795567439816.jpg',
      address: 'Av. Paulista, 1180, Apto 74 — Bela Vista, São Paulo - SP',
      dominantFoot: 'Destro',
      preferredPosition: 'Goleiro',
      health: {
        emergencyContact: 'Fernanda Costa · (11) 99144-3209',
        healthPlan: 'SulAmérica Especial',
        bloodType: 'A+',
        healthIssues: 'Histórico leve de entorse no tornozelo esquerdo',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 7, preparoFisico: 8, chute: 7, defesa: 9, ataque: 5 },
      adminSkills: { habilidade: 7, preparoFisico: 8, chute: 7, defesa: 10, ataque: 5 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-lucas',
      username: 'lucas',
      name: 'Lucas Ferreira',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Vergueiro, 890 — Paraíso, São Paulo - SP',
      dominantFoot: 'Canhoto',
      preferredPosition: 'Ala Esquerdo',
      health: {
        emergencyContact: 'Marcos Ferreira · (11) 98765-1102',
        healthPlan: 'Unimed Paulistana',
        bloodType: 'B+',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 9, preparoFisico: 9, chute: 8, defesa: 7, ataque: 8 },
      adminSkills: { habilidade: 8, preparoFisico: 9, chute: 8, defesa: 7, ataque: 8 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-rafael',
      username: 'rafael',
      name: 'Rafael Mendes',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Augusta, 1520 — Consolação, São Paulo - SP',
      dominantFoot: 'Destro',
      preferredPosition: 'Fixo',
      health: {
        emergencyContact: 'Paula Mendes · (11) 99601-7783',
        healthPlan: 'Amil 400',
        bloodType: 'O-',
        healthIssues: 'Asma leve induzida por esforço',
        continuousMedication: 'Bombinha preventiva (uso eventual)',
      },
      selfSkills: { habilidade: 7, preparoFisico: 7, chute: 8, defesa: 9, ataque: 6 },
      adminSkills: { habilidade: 7, preparoFisico: 7, chute: 8, defesa: 9, ataque: 6 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-bruno',
      username: 'bruno',
      name: 'Bruno Rocha',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Domingos de Morais, 450 — Vila Mariana, São Paulo - SP',
      dominantFoot: 'Ambidestro',
      preferredPosition: 'Pivô',
      health: {
        emergencyContact: 'Ricardo Rocha · (11) 98322-9045',
        healthPlan: 'Porto Seguro Saúde',
        bloodType: 'AB+',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 8, preparoFisico: 6, chute: 9, defesa: 5, ataque: 9 },
      adminSkills: { habilidade: 8, preparoFisico: 6, chute: 9, defesa: 6, ataque: 9 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-thiago',
      username: 'thiago',
      name: 'Thiago Nogueira',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Joaquim Floriano, 610 — Itaim Bibi, São Paulo - SP',
      dominantFoot: 'Destro',
      preferredPosition: 'Goleiro',
      health: {
        emergencyContact: 'Juliana Nogueira · (11) 99200-1854',
        healthPlan: 'NotreDame Intermédica',
        bloodType: 'A-',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 6, preparoFisico: 7, chute: 6, defesa: 9, ataque: 4 },
      adminSkills: { habilidade: 6, preparoFisico: 7, chute: 6, defesa: 9, ataque: 4 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-kaue',
      username: 'kaue',
      name: 'Kauê Oliveira',
      role: 'player',
      avatarUrl: '',
      address: 'Av. Pompéia, 320 — Perdizes, São Paulo - SP',
      dominantFoot: 'Canhoto',
      preferredPosition: 'Ala Esquerdo',
      health: {
        emergencyContact: 'Sônia Oliveira · (11) 98119-5541',
        healthPlan: 'SUS / Cartão Nacional',
        bloodType: 'O+',
        healthIssues: 'Alergia a dipirona',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 8, preparoFisico: 8, chute: 7, defesa: 6, ataque: 8 },
      adminSkills: { habilidade: 7, preparoFisico: 8, chute: 7, defesa: 6, ataque: 8 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-guilherme',
      username: 'guilherme',
      name: 'Guilherme Alves',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Clélia, 940 — Lapa, São Paulo - SP',
      dominantFoot: 'Destro',
      preferredPosition: 'Fixo',
      health: {
        emergencyContact: 'André Alves · (11) 97433-2298',
        healthPlan: 'Bradesco Saúde',
        bloodType: 'B-',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 7, preparoFisico: 8, chute: 7, defesa: 8, ataque: 7 },
      adminSkills: { habilidade: 7, preparoFisico: 8, chute: 7, defesa: 8, ataque: 7 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-pedro',
      username: 'pedro',
      name: 'Pedro Henrique',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Cerro Corá, 512 — Alto de Pinheiros, São Paulo - SP',
      dominantFoot: 'Destro',
      preferredPosition: 'Pivô',
      health: {
        emergencyContact: 'Mariana Souza · (11) 99554-6012',
        healthPlan: 'Omint',
        bloodType: 'A+',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 8, preparoFisico: 7, chute: 8, defesa: 6, ataque: 8 },
      adminSkills: { habilidade: 7, preparoFisico: 7, chute: 8, defesa: 6, ataque: 8 },
      pin: defaultPin,
    }),
    createSeedUser({
      id: 'usr-vitor',
      username: 'vitor',
      name: 'Vitor Ribeiro',
      role: 'player',
      avatarUrl: '',
      address: 'Rua Cardeal Arcoverde, 1210 — Pinheiros, São Paulo - SP',
      dominantFoot: 'Canhoto',
      preferredPosition: 'Ala Direito',
      health: {
        emergencyContact: 'Lúcia Ribeiro · (11) 98441-3099',
        healthPlan: 'SulAmérica',
        bloodType: 'O+',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: { habilidade: 6, preparoFisico: 9, chute: 7, defesa: 7, ataque: 7 },
      adminSkills: { habilidade: 6, preparoFisico: 9, chute: 7, defesa: 7, ataque: 7 },
      pin: defaultPin,
    }),
  ];

  const arenaGroupId = 'grp-arena-sul';
  const quintaGroupId = 'grp-quinta-vila';

  const groups: PeladaGroup[] = [
    {
      id: arenaGroupId,
      name: 'Pelada Arena Sul · Terças',
      description: 'Futsal tradicional das terças à noite na quadra coberta da Vila Olímpia.',
      dayOfWeek: 2,
      time: '20:30',
      location: 'Ginásio Arena Sul — Quadra 1',
      teamCount: 2,
      playersPerTeam: 5,
      autoSchedule: true,
      createdBy: 'usr-didi',
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      members: users.map((u) =>
        toGroupMember(u, u.id === 'usr-didi' || u.id === 'usr-mario' ? 'admin' : 'player'),
      ),
    },
    {
      id: quintaGroupId,
      name: 'Pelada Quinta Show · Vila Mariana',
      description: 'Pelada de quinta-feira em formato 3 times rotativos na Vila Mariana.',
      dayOfWeek: 4,
      time: '21:00',
      location: 'Quadra Coberta Vila Mariana — Piso Oficial',
      teamCount: 3,
      playersPerTeam: 4,
      autoSchedule: true,
      createdBy: 'usr-bruno',
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      members: ['usr-bruno', 'usr-mario', 'usr-lucas', 'usr-kaue', 'usr-thiago', 'usr-pedro']
        .map((id) => users.find((u) => u.id === id)!)
        .map((u) =>
          toGroupMember(u, u.id === 'usr-bruno' || u.id === 'usr-mario' ? 'admin' : 'player'),
        ),
    },
  ];

  const finance: FinanceEntry[] = [
    {
      id: 'fin-1',
      groupId: arenaGroupId,
      type: 'income',
      date: formatMonthOffset(-2, 5),
      description: 'Mensalidades da turma — Lote completo',
      category: 'Mensalidade',
      amount: 1200,
      createdBy: 'usr-didi',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-2',
      groupId: arenaGroupId,
      type: 'expense',
      date: formatMonthOffset(-2, 8),
      description: 'Locação mensal Ginásio Arena Sul (4 terças)',
      category: 'Aluguel de Quadra',
      amount: 880,
      createdBy: 'usr-mario',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-3',
      groupId: arenaGroupId,
      type: 'income',
      date: formatMonthOffset(-1, 6),
      description: 'Mensalidades da turma — Mês anterior',
      category: 'Mensalidade',
      amount: 1320,
      createdBy: 'usr-didi',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-4',
      groupId: arenaGroupId,
      type: 'expense',
      date: formatMonthOffset(-1, 10),
      description: 'Locação mensal Ginásio Arena Sul',
      category: 'Aluguel de Quadra',
      amount: 880,
      createdBy: 'usr-mario',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-5',
      groupId: arenaGroupId,
      type: 'expense',
      date: formatMonthOffset(-1, 18),
      description: 'Compra de 2 bolas Penalty Max 500 + 12 coletes',
      category: 'Material/Coletes',
      amount: 340,
      createdBy: 'usr-didi',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-6',
      groupId: arenaGroupId,
      type: 'income',
      date: formatMonthOffset(0, 4),
      description: 'Mensalidades confirmadas do mês atual',
      category: 'Mensalidade',
      amount: 1440,
      createdBy: 'usr-didi',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-7',
      groupId: arenaGroupId,
      type: 'income',
      date: formatMonthOffset(0, 12),
      description: 'Diárias avulsas convidados (3 atletas)',
      category: 'Diária Avulsa',
      amount: 135,
      createdBy: 'usr-mario',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-8',
      groupId: arenaGroupId,
      type: 'expense',
      date: formatMonthOffset(0, 14),
      description: 'Reserva quadra coberta + arbitragem',
      category: 'Aluguel de Quadra',
      amount: 920,
      createdBy: 'usr-mario',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-9',
      groupId: arenaGroupId,
      type: 'expense',
      date: formatMonthOffset(0, 19),
      description: 'Gelo, isotônico e água pós-jogo',
      category: 'Confraternização',
      amount: 145,
      createdBy: 'usr-didi',
      createdAt: new Date().toISOString(),
    },
    // Caixa independente da Pelada Quinta Show
    {
      id: 'fin-q1',
      groupId: quintaGroupId,
      type: 'income',
      date: formatMonthOffset(0, 3),
      description: 'Rateio mensal Quinta Show (6 mensalistas)',
      category: 'Mensalidade',
      amount: 720,
      createdBy: 'usr-bruno',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-q2',
      groupId: quintaGroupId,
      type: 'expense',
      date: formatMonthOffset(0, 7),
      description: 'Aluguel quadra Vila Mariana',
      category: 'Aluguel de Quadra',
      amount: 460,
      createdBy: 'usr-bruno',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'fin-q3',
      groupId: quintaGroupId,
      type: 'income',
      date: formatMonthOffset(0, 15),
      description: 'Diárias avulsas de quinta-feira',
      category: 'Diária Avulsa',
      amount: 180,
      createdBy: 'usr-mario',
      createdAt: new Date().toISOString(),
    },
  ];

  const arenaMembers = getGroupMemberProfiles(
    { schemaVersion: 2, users, groups, finance: [], peladas: [] },
    groups[0],
  );
  const arenaIds = arenaMembers.map((u) => u.id);

  const completedPeladaTeams: TeamRoster[] = [
    {
      id: 'team-a',
      name: 'Time A',
      color: 'emerald',
      playerIds: ['usr-didi', 'usr-mario', 'usr-rafael', 'usr-bruno', 'usr-vitor'],
    },
    {
      id: 'team-b',
      name: 'Time B',
      color: 'amber',
      playerIds: ['usr-thiago', 'usr-lucas', 'usr-kaue', 'usr-guilherme', 'usr-pedro'],
    },
  ];

  const nextMatchDateObj = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const nextDateStr = `${nextMatchDateObj.getFullYear()}-${String(nextMatchDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextMatchDateObj.getDate()).padStart(2, '0')}`;
  const nextTimeStr = `${String(nextMatchDateObj.getHours()).padStart(2, '0')}:${String(nextMatchDateObj.getMinutes()).padStart(2, '0')}`;

  const todayDraw = drawBalancedTeams(arenaMembers.slice(0, 8), 2, 5);

  const quintaMembers = getGroupMemberProfiles(
    { schemaVersion: 2, users, groups, finance: [], peladas: [] },
    groups[1],
  );
  const quintaDraw = drawBalancedTeams(quintaMembers, 3, 4);

  const peladas: PeladaSession[] = [
    {
      id: 'pel-today',
      groupId: arenaGroupId,
      title: 'Pelada de Hoje · Arena Sul',
      date: nextDateStr,
      time: nextTimeStr,
      scheduledAt: nextMatchDateObj.toISOString(),
      location: 'Ginásio Arena Sul — Quadra 1',
      teamCount: 2,
      playersPerTeam: 5,
      status: 'scheduled',
      presentPlayerIds: arenaIds.slice(0, 8),
      teams: todayDraw.teams,
      adjustmentNote: todayDraw.adjustmentNote,
      live: {
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 0,
        awayScore: 0,
        isRunning: false,
        elapsedSeconds: 0,
        events: [],
      },
      votes: [],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'pel-last-week',
      groupId: arenaGroupId,
      title: 'Pelada Semana Passada · Arena Sul',
      date: formatDateOffset(-7),
      time: '20:30',
      location: 'Ginásio Arena Sul — Quadra 1',
      teamCount: 2,
      playersPerTeam: 5,
      status: 'completed',
      presentPlayerIds: arenaIds,
      teams: completedPeladaTeams,
      live: {
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 6,
        awayScore: 5,
        isRunning: false,
        elapsedSeconds: 3000,
        events: [
          {
            id: 'evt-1',
            type: 'goal',
            teamId: 'team-a',
            playerId: 'usr-didi',
            assistPlayerId: 'usr-bruno',
            minute: 6,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'evt-2',
            type: 'save',
            teamId: 'team-a',
            playerId: 'usr-mario',
            minute: 11,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'evt-3',
            type: 'goal',
            teamId: 'team-b',
            playerId: 'usr-lucas',
            assistPlayerId: 'usr-kaue',
            minute: 14,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'evt-4',
            type: 'goal',
            teamId: 'team-a',
            playerId: 'usr-bruno',
            assistPlayerId: 'usr-didi',
            minute: 22,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'evt-5',
            type: 'save',
            teamId: 'team-b',
            playerId: 'usr-thiago',
            minute: 29,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'evt-6',
            type: 'goal',
            teamId: 'team-a',
            playerId: 'usr-didi',
            minute: 41,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      votes: [
        { voterId: 'usr-mario', targetPlayerId: 'usr-didi', createdAt: new Date().toISOString() },
        { voterId: 'usr-rafael', targetPlayerId: 'usr-didi', createdAt: new Date().toISOString() },
        { voterId: 'usr-lucas', targetPlayerId: 'usr-mario', createdAt: new Date().toISOString() },
        { voterId: 'usr-bruno', targetPlayerId: 'usr-didi', createdAt: new Date().toISOString() },
        { voterId: 'usr-thiago', targetPlayerId: 'usr-lucas', createdAt: new Date().toISOString() },
      ],
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
    {
      id: 'pel-quinta-1',
      groupId: quintaGroupId,
      title: 'Quinta Show · Edição da Semana',
      date: formatDateOffset(2),
      time: '21:00',
      location: 'Quadra Coberta Vila Mariana — Piso Oficial',
      teamCount: 3,
      playersPerTeam: 4,
      status: 'scheduled',
      presentPlayerIds: quintaMembers.map((m) => m.id),
      teams: quintaDraw.teams,
      adjustmentNote: quintaDraw.adjustmentNote,
      live: {
        homeTeamId: quintaDraw.teams[0]?.id || 'team-a',
        awayTeamId: quintaDraw.teams[1]?.id || 'team-b',
        homeScore: 0,
        awayScore: 0,
        isRunning: false,
        elapsedSeconds: 0,
        events: [],
      },
      votes: [],
      autoScheduled: true,
      createdAt: new Date().toISOString(),
    },
  ];

  return { schemaVersion: 2, users, groups, finance, peladas };
}

export function getNextOccurrenceForGroup(group: {
  dayOfWeek: number;
  time: string;
}): {
  date: string;
  scheduledAt: string;
} {
  const [hh, mm] = group.time.split(':').map((n) => Number(n) || 0);
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hh, mm, 0, 0);

  const currentDow = candidate.getDay();
  let daysAhead = (group.dayOfWeek - currentDow + 7) % 7;
  if (daysAhead === 0 && candidate.getTime() <= now.getTime()) {
    daysAhead = 7;
  }
  candidate.setDate(candidate.getDate() + daysAhead);

  const date = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
  return { date, scheduledAt: candidate.toISOString() };
}

export function syncRecurringPeladas(db: AppDatabase): boolean {
  if (!Array.isArray(db.groups)) {
    db.groups = [];
  }
  let changed = false;

  for (const group of db.groups) {
    if (!group.autoSchedule) continue;
    const { date, scheduledAt } = getNextOccurrenceForGroup(group);

    const alreadyExists = db.peladas.some(
      (p) =>
        p.groupId === group.id &&
        ((p.date === date && p.time === group.time) || Boolean(p.autoScheduled && p.date === date)),
    );
    if (alreadyExists) continue;

    const emptyDraw = drawBalancedTeams([], group.teamCount, group.playersPerTeam || 5);
    db.peladas.unshift({
      id: `pel-${crypto.randomUUID().slice(0, 8)}`,
      groupId: group.id,
      title: `${group.name} (${date.slice(8, 10)}/${date.slice(5, 7)})`,
      date,
      time: group.time,
      scheduledAt,
      location: group.location,
      teamCount: group.teamCount,
      playersPerTeam: group.playersPerTeam || 5,
      status: 'scheduled',
      presentPlayerIds: [],
      teams: emptyDraw.teams,
      live: {
        homeTeamId: emptyDraw.teams[0]?.id || 'team-a',
        awayTeamId: emptyDraw.teams[1]?.id || 'team-b',
        homeScore: 0,
        awayScore: 0,
        isRunning: false,
        elapsedSeconds: 0,
        events: [],
      },
      votes: [],
      autoScheduled: true,
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  if (changed) {
    saveDb(db);
  }
  return changed;
}

let memoryDb: AppDatabase | null = null;
const dataFilePath = resolveDataFile();

export function getDb(): AppDatabase {
  if (memoryDb) return memoryDb;
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppDatabase>;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        if (parsed.schemaVersion === 2 && Array.isArray(parsed.groups)) {
          const db = parsed as AppDatabase;
          for (const g of db.groups) {
            if (!g.playersPerTeam) g.playersPerTeam = 5;
            if (!Array.isArray(g.members)) g.members = [];
          }
          for (const p of db.peladas) {
            if (!p.playersPerTeam) p.playersPerTeam = 5;
          }
          memoryDb = db;
          syncRecurringPeladas(memoryDb);
          return memoryDb;
        }
        // Migrate v1 data into v2 default group + second demo group if needed
        const seed = createInitialSeed();
        const defaultGroupId = seed.groups[0].id;
        const users = parsed.users as StoredUser[];
        const migratedGroup: PeladaGroup = {
          ...seed.groups[0],
          members: users.map((u) => toGroupMember(u, u.role)),
        };
        const migratedFinance = (parsed.finance || []).map((f) => ({
          ...f,
          groupId: (f as FinanceEntry).groupId || defaultGroupId,
        }));
        const migratedPeladas = (parsed.peladas || []).map((p) => ({
          ...p,
          groupId: (p as PeladaSession).groupId || defaultGroupId,
          playersPerTeam: p.playersPerTeam || 5,
        }));
        memoryDb = {
          schemaVersion: 2,
          users,
          groups: [migratedGroup, seed.groups[1]],
          finance: [...migratedFinance, ...seed.finance.filter((f) => f.groupId !== defaultGroupId)],
          peladas: [...migratedPeladas, ...seed.peladas.filter((p) => p.groupId !== defaultGroupId)],
        };
        syncRecurringPeladas(memoryDb);
        saveDb(memoryDb);
        return memoryDb;
      }
    }
  } catch {
    // Fallback to seed if corrupted or unreadable
  }

  memoryDb = createInitialSeed();
  syncRecurringPeladas(memoryDb);
  saveDb(memoryDb);
  return memoryDb;
}

export function saveDb(db: AppDatabase): void {
  memoryDb = db;
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(db, null, 2), 'utf8');
  } catch {
    // Graceful fallback if filesystem is read-only in restricted runtime
  }
}
