import fs from 'node:fs';
import path from 'node:path';
import type {
  FinanceEntry,
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
  users: StoredUser[];
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

export function drawBalancedTeams(
  players: PlayerProfile[],
  teamCount: number,
): TeamRoster[] {
  const count = Math.max(2, Math.min(4, Math.floor(teamCount) || 2));
  const labels = ['Time A', 'Time B', 'Time C', 'Time D'];
  const colors: TeamColor[] = ['emerald', 'amber', 'slate', 'rose'];

  const teams: {
    id: string;
    name: string;
    color: TeamColor;
    playerIds: string[];
    ratingSum: number;
  }[] = Array.from({ length: count }, (_, idx) => ({
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
    // Pick team with fewest players; tie-break by lowest total rating
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

  return teams.map(({ id, name, color, playerIds }) => ({
    id,
    name,
    color,
    playerIds,
  }));
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

  const finance: FinanceEntry[] = [
    {
      id: 'fin-1',
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
      type: 'expense',
      date: formatMonthOffset(0, 19),
      description: 'Gelo, isotônico e água pós-jogo',
      category: 'Confraternização',
      amount: 145,
      createdBy: 'usr-didi',
      createdAt: new Date().toISOString(),
    },
  ];

  const safeProfiles = users.map(sanitizeUser);
  const allIds = safeProfiles.map((u) => u.id);
  const scheduledTeams = drawBalancedTeams(safeProfiles, 2);

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

  const peladas: PeladaSession[] = [
    {
      id: 'pel-today',
      title: 'Pelada de Terça · Arena Sul',
      date: formatDateOffset(0),
      time: '20:30',
      location: 'Ginásio Arena Sul — Quadra 1',
      teamCount: 2,
      status: 'scheduled',
      presentPlayerIds: allIds,
      teams: scheduledTeams,
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
      title: 'Pelada Semana Passada · Arena Sul',
      date: formatDateOffset(-7),
      time: '20:30',
      location: 'Ginásio Arena Sul — Quadra 1',
      teamCount: 2,
      status: 'completed',
      presentPlayerIds: allIds,
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
  ];

  return { users, finance, peladas };
}

let memoryDb: AppDatabase | null = null;
const dataFilePath = resolveDataFile();

export function getDb(): AppDatabase {
  if (memoryDb) return memoryDb;
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const parsed = JSON.parse(raw) as AppDatabase;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        memoryDb = parsed;
        return memoryDb;
      }
    }
  } catch {
    // Fallback to seed if corrupted or unreadable
  }

  memoryDb = createInitialSeed();
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
