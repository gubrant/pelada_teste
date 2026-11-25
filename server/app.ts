import crypto from 'node:crypto';
import express from 'express';
import type {
  BloodType,
  DominantFoot,
  FinanceCategory,
  FinanceEntry,
  FinanceType,
  FutsalPosition,
  MatchEvent,
  MatchEventType,
  PeladaSession,
  PlayerStatsSummary,
  SkillRatings,
  TeamRoster,
  UserRole,
} from '../src/types.ts';
import {
  type AuthenticatedRequest,
  createSessionToken,
  hashPin,
  requireAdmin,
  requireAuth,
  verifyPin,
} from './auth.ts';
import {
  computeFinalRating,
  drawBalancedTeams,
  getDb,
  sanitizeUser,
  saveDb,
  type StoredUser,
} from './store.ts';

const VALID_POSITIONS: FutsalPosition[] = [
  'Goleiro',
  'Fixo',
  'Ala Esquerdo',
  'Ala Direito',
  'Pivô',
];

const VALID_FEET: DominantFoot[] = ['Destro', 'Canhoto', 'Ambidestro'];

const VALID_BLOOD_TYPES: BloodType[] = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'Não informado',
];

const VALID_CATEGORIES: FinanceCategory[] = [
  'Mensalidade',
  'Diária Avulsa',
  'Aluguel de Quadra',
  'Material/Coletes',
  'Confraternização',
  'Outros',
];

function isSafeImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.length > 2_500_000) return false;
  if (trimmed.startsWith('/src/assets/')) return true;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function clampSkill(value: unknown, fallback = 7): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function normalizeSkills(input: unknown, fallback: SkillRatings): SkillRatings {
  if (!input || typeof input !== 'object') return fallback;
  const obj = input as Record<string, unknown>;
  return {
    habilidade: clampSkill(obj.habilidade, fallback.habilidade),
    preparoFisico: clampSkill(obj.preparoFisico, fallback.preparoFisico),
    chute: clampSkill(obj.chute, fallback.chute),
    defesa: clampSkill(obj.defesa, fallback.defesa),
    ataque: clampSkill(obj.ataque, fallback.ataque),
  };
}

function computeStats(peladas: PeladaSession[], users: StoredUser[]): Record<string, PlayerStatsSummary> {
  const stats: Record<string, PlayerStatsSummary> = {};
  for (const u of users) {
    stats[u.id] = {
      playerId: u.id,
      goals: 0,
      assists: 0,
      saves: 0,
      matchesAttended: 0,
      craqueVotes: 0,
      craqueTitles: 0,
    };
  }

  for (const pelada of peladas) {
    if (pelada.status === 'completed' || pelada.status === 'live') {
      for (const pid of pelada.presentPlayerIds) {
        if (stats[pid]) stats[pid].matchesAttended += 1;
      }
      for (const ev of pelada.live.events) {
        if (ev.type === 'goal') {
          if (stats[ev.playerId]) stats[ev.playerId].goals += 1;
          if (ev.assistPlayerId && stats[ev.assistPlayerId]) {
            stats[ev.assistPlayerId].assists += 1;
          }
        } else if (ev.type === 'assist') {
          if (stats[ev.playerId]) stats[ev.playerId].assists += 1;
        } else if (ev.type === 'save') {
          if (stats[ev.playerId]) stats[ev.playerId].saves += 1;
        }
      }
    }

    if (pelada.status === 'completed' && pelada.votes.length > 0) {
      const tally: Record<string, number> = {};
      for (const v of pelada.votes) {
        if (stats[v.targetPlayerId]) {
          stats[v.targetPlayerId].craqueVotes += 1;
        }
        tally[v.targetPlayerId] = (tally[v.targetPlayerId] || 0) + 1;
      }
      let maxVotes = 0;
      for (const count of Object.values(tally)) {
        if (count > maxVotes) maxVotes = count;
      }
      if (maxVotes > 0) {
        for (const [pid, count] of Object.entries(tally)) {
          if (count === maxVotes && stats[pid]) {
            stats[pid].craqueTitles += 1;
          }
        }
      }
    }
  }

  return stats;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Authentication
  app.post('/api/auth/login', (req, res) => {
    const username = typeof req.body?.username === 'string'
      ? req.body.username.trim().toLowerCase()
      : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    if (!username || !/^\d{6}$/.test(pin)) {
      res.status(400).json({
        error: 'Informe o nome de usuário e uma senha numérica de 6 dígitos.',
      });
      return;
    }

    const db = getDb();
    const user = db.users.find((u) => u.username.toLowerCase() === username);
    if (!user || !verifyPin(pin, user.pinHash, user.pinSalt)) {
      res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({
        error: 'Este cadastro está desativado. Procure um administrador.',
      });
      return;
    }

    const token = createSessionToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    res.json({ token, user: sanitizeUser(user) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.session?.sub);
    if (!user || !user.active) {
      res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  // Players CRUD
  app.get('/api/players', requireAuth, (_req, res) => {
    const db = getDb();
    const players = db.users.map(sanitizeUser);
    res.json({ players });
  });

  app.post('/api/players', requireAuth, requireAdmin, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const username = typeof body.username === 'string'
      ? body.username.trim().toLowerCase()
      : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!/^[a-z0-9._-]{2,30}$/.test(username)) {
      res.status(400).json({
        error: 'Login inválido. Use 2 a 30 caracteres (letras minúsculas, números, ponto ou underline).',
      });
      return;
    }
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Informe o nome completo do peladeiro.' });
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      res.status(400).json({ error: 'A senha deve conter exatamente 6 dígitos numéricos.' });
      return;
    }

    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
    if (!isSafeImageUrl(avatarUrl)) {
      res.status(400).json({ error: 'Formato de foto inválido ou muito grande.' });
      return;
    }

    const db = getDb();
    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      res.status(409).json({ error: `O login "${username}" já está cadastrado.` });
      return;
    }

    const role: UserRole = body.role === 'admin' ? 'admin' : 'player';
    const dominantFoot: DominantFoot = VALID_FEET.includes(body.dominantFoot as DominantFoot)
      ? (body.dominantFoot as DominantFoot)
      : 'Destro';
    const preferredPosition: FutsalPosition = VALID_POSITIONS.includes(
      body.preferredPosition as FutsalPosition,
    )
      ? (body.preferredPosition as FutsalPosition)
      : 'Ala Direito';

    const rawHealth = (body.health && typeof body.health === 'object'
      ? body.health
      : {}) as Record<string, unknown>;

    const bloodType: BloodType = VALID_BLOOD_TYPES.includes(rawHealth.bloodType as BloodType)
      ? (rawHealth.bloodType as BloodType)
      : 'Não informado';

    const defaultSkills: SkillRatings = {
      habilidade: 7,
      preparoFisico: 7,
      chute: 7,
      defesa: 7,
      ataque: 7,
    };

    const selfSkills = normalizeSkills(body.selfSkills, defaultSkills);
    const adminSkills = normalizeSkills(body.adminSkills, selfSkills);
    const { hash, salt } = hashPin(pin);

    const newUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      username,
      name,
      role,
      active: body.active === undefined ? true : Boolean(body.active),
      avatarUrl,
      address: typeof body.address === 'string' ? body.address.trim().slice(0, 200) : '',
      dominantFoot,
      preferredPosition,
      health: {
        emergencyContact:
          typeof rawHealth.emergencyContact === 'string'
            ? rawHealth.emergencyContact.trim().slice(0, 120)
            : '',
        healthPlan:
          typeof rawHealth.healthPlan === 'string'
            ? rawHealth.healthPlan.trim().slice(0, 100)
            : '',
        bloodType,
        healthIssues:
          typeof rawHealth.healthIssues === 'string'
            ? rawHealth.healthIssues.trim().slice(0, 250)
            : 'Nenhum',
        continuousMedication:
          typeof rawHealth.continuousMedication === 'string'
            ? rawHealth.continuousMedication.trim().slice(0, 250)
            : 'Nenhum',
      },
      selfSkills,
      adminSkills,
      finalRating: computeFinalRating(adminSkills),
      adminReviewed: true,
      createdAt: new Date().toISOString(),
      pinHash: hash,
      pinSalt: salt,
    };

    db.users.push(newUser);
    saveDb(db);
    res.status(201).json({ player: sanitizeUser(newUser) });
  });

  app.put('/api/players/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const isAdmin = req.session?.role === 'admin';
    const isSelf = req.session?.sub === id;

    if (!isAdmin && !isSelf) {
      res.status(403).json({
        error: 'Você só pode editar a sua própria ficha de peladeiro.',
      });
      return;
    }

    const db = getDb();
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Peladeiro não encontrado.' });
      return;
    }

    const current = db.users[idx];
    const body = req.body as Record<string, unknown>;

    if (body.avatarUrl !== undefined && !isSafeImageUrl(body.avatarUrl)) {
      res.status(400).json({ error: 'Formato de imagem inválido ou muito grande.' });
      return;
    }

    let nextPinHash = current.pinHash;
    let nextPinSalt = current.pinSalt;
    if (typeof body.pin === 'string' && body.pin.trim() !== '') {
      const trimmedPin = body.pin.trim();
      if (!/^\d{6}$/.test(trimmedPin)) {
        res.status(400).json({ error: 'A senha deve ter exatamente 6 dígitos numéricos.' });
        return;
      }
      const hashed = hashPin(trimmedPin);
      nextPinHash = hashed.hash;
      nextPinSalt = hashed.salt;
    }

    let nextUsername = current.username;
    if (isAdmin && typeof body.username === 'string') {
      const candidate = body.username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,30}$/.test(candidate)) {
        res.status(400).json({ error: 'Login inválido.' });
        return;
      }
      if (db.users.some((u) => u.id !== id && u.username.toLowerCase() === candidate)) {
        res.status(409).json({ error: `O login "${candidate}" já está em uso.` });
        return;
      }
      nextUsername = candidate;
    }

    let nextRole = current.role;
    let nextActive = current.active;
    if (isAdmin) {
      if (body.role === 'admin' || body.role === 'player') {
        nextRole = body.role;
      }
      if (typeof body.active === 'boolean') {
        nextActive = body.active;
      }
      const activeAdminsAfter = db.users.filter((u) =>
        u.id === id ? nextRole === 'admin' && nextActive : u.role === 'admin' && u.active,
      );
      if (activeAdminsAfter.length === 0) {
        res.status(400).json({
          error: 'O sistema precisa manter pelo menos um administrador ativo.',
        });
        return;
      }
    }

    const rawHealth = (body.health && typeof body.health === 'object'
      ? body.health
      : {}) as Record<string, unknown>;

    const nextSelfSkills = body.selfSkills
      ? normalizeSkills(body.selfSkills, current.selfSkills)
      : current.selfSkills;

    const nextAdminSkills =
      isAdmin && body.adminSkills
        ? normalizeSkills(body.adminSkills, current.adminSkills)
        : current.adminSkills;

    const nextAdminReviewed =
      isAdmin && body.adminSkills ? true : current.adminReviewed;

    const updated: StoredUser = {
      ...current,
      username: nextUsername,
      name:
        typeof body.name === 'string' && body.name.trim().length >= 2
          ? body.name.trim().slice(0, 80)
          : current.name,
      role: nextRole,
      active: nextActive,
      avatarUrl:
        typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : current.avatarUrl,
      address:
        typeof body.address === 'string'
          ? body.address.trim().slice(0, 200)
          : current.address,
      dominantFoot: VALID_FEET.includes(body.dominantFoot as DominantFoot)
        ? (body.dominantFoot as DominantFoot)
        : current.dominantFoot,
      preferredPosition: VALID_POSITIONS.includes(body.preferredPosition as FutsalPosition)
        ? (body.preferredPosition as FutsalPosition)
        : current.preferredPosition,
      health: {
        emergencyContact:
          typeof rawHealth.emergencyContact === 'string'
            ? rawHealth.emergencyContact.trim().slice(0, 120)
            : current.health.emergencyContact,
        healthPlan:
          typeof rawHealth.healthPlan === 'string'
            ? rawHealth.healthPlan.trim().slice(0, 100)
            : current.health.healthPlan,
        bloodType: VALID_BLOOD_TYPES.includes(rawHealth.bloodType as BloodType)
          ? (rawHealth.bloodType as BloodType)
          : current.health.bloodType,
        healthIssues:
          typeof rawHealth.healthIssues === 'string'
            ? rawHealth.healthIssues.trim().slice(0, 250)
            : current.health.healthIssues,
        continuousMedication:
          typeof rawHealth.continuousMedication === 'string'
            ? rawHealth.continuousMedication.trim().slice(0, 250)
            : current.health.continuousMedication,
      },
      selfSkills: nextSelfSkills,
      adminSkills: nextAdminSkills,
      finalRating: computeFinalRating(nextAdminSkills),
      adminReviewed: nextAdminReviewed,
      pinHash: nextPinHash,
      pinSalt: nextPinSalt,
    };

    db.users[idx] = updated;
    saveDb(db);
    res.json({ player: sanitizeUser(updated) });
  });

  app.delete('/api/players/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    if (req.session?.sub === id) {
      res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
      return;
    }

    const db = getDb();
    const target = db.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'Peladeiro não encontrado.' });
      return;
    }

    const remainingAdmins = db.users.filter(
      (u) => u.id !== id && u.role === 'admin' && u.active,
    );
    if (remainingAdmins.length === 0) {
      res.status(400).json({
        error: 'Não é possível excluir o único administrador ativo.',
      });
      return;
    }

    db.users = db.users.filter((u) => u.id !== id);
    for (const pel of db.peladas) {
      pel.presentPlayerIds = pel.presentPlayerIds.filter((pid) => pid !== id);
      for (const team of pel.teams) {
        team.playerIds = team.playerIds.filter((pid) => pid !== id);
      }
    }
    saveDb(db);
    res.json({ deletedId: id });
  });

  // Finance
  app.get('/api/finance', requireAuth, (_req, res) => {
    const db = getDb();
    const entries = [...db.finance].sort((a, b) => b.date.localeCompare(a.date));
    res.json({ entries });
  });

  app.post('/api/finance', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const body = req.body as Record<string, unknown>;
    const type: FinanceType = body.type === 'expense' ? 'expense' : 'income';
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category: FinanceCategory = VALID_CATEGORIES.includes(
      body.category as FinanceCategory,
    )
      ? (body.category as FinanceCategory)
      : 'Outros';
    const amount = Number(body.amount);

    if (!description || description.length > 160) {
      res.status(400).json({ error: 'Informe uma descrição válida (até 160 caracteres).' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      res.status(400).json({ error: 'Informe um valor positivo válido.' });
      return;
    }

    const receiptUrl = typeof body.receiptUrl === 'string' ? body.receiptUrl.trim() : '';
    if (!isSafeImageUrl(receiptUrl)) {
      res.status(400).json({ error: 'Comprovante inválido ou acima do tamanho permitido.' });
      return;
    }

    const entry: FinanceEntry = {
      id: `fin-${crypto.randomUUID().slice(0, 8)}`,
      type,
      date,
      description,
      category,
      amount: Math.round(amount * 100) / 100,
      receiptUrl: receiptUrl || undefined,
      createdBy: req.session?.sub || 'system',
      createdAt: new Date().toISOString(),
    };

    const db = getDb();
    db.finance.unshift(entry);
    saveDb(db);
    res.status(201).json({ entry });
  });

  app.delete('/api/finance/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const exists = db.finance.some((f) => f.id === id);
    if (!exists) {
      res.status(404).json({ error: 'Lançamento financeiro não encontrado.' });
      return;
    }
    db.finance = db.finance.filter((f) => f.id !== id);
    saveDb(db);
    res.json({ deletedId: id });
  });

  // Peladas & Matches
  app.get('/api/peladas', requireAuth, (_req, res) => {
    const db = getDb();
    const peladas = [...db.peladas].sort((a, b) => b.date.localeCompare(a.date));
    const stats = computeStats(db.peladas, db.users);
    res.json({ peladas, stats });
  });

  app.post('/api/peladas', requireAuth, requireAdmin, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 100)
      : 'Pelada Oficial · Quadra';
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);
    const time = typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time)
      ? body.time
      : '20:30';
    const location = typeof body.location === 'string' && body.location.trim()
      ? body.location.trim().slice(0, 120)
      : 'Ginásio Arena Sul — Quadra 1';
    const teamCount = Math.max(2, Math.min(4, Number(body.teamCount) || 2));

    const db = getDb();
    const activeIds = new Set(db.users.filter((u) => u.active).map((u) => u.id));
    const presentPlayerIds = Array.isArray(body.presentPlayerIds)
      ? body.presentPlayerIds.filter((id): id is string => typeof id === 'string' && activeIds.has(id))
      : Array.from(activeIds);

    const presentPlayers = db.users
      .filter((u) => presentPlayerIds.includes(u.id))
      .map(sanitizeUser);
    const teams = drawBalancedTeams(presentPlayers, teamCount);

    const newPelada: PeladaSession = {
      id: `pel-${crypto.randomUUID().slice(0, 8)}`,
      title,
      date,
      time,
      location,
      teamCount,
      status: 'scheduled',
      presentPlayerIds,
      teams,
      live: {
        homeTeamId: teams[0]?.id || 'team-a',
        awayTeamId: teams[1]?.id || 'team-b',
        homeScore: 0,
        awayScore: 0,
        isRunning: false,
        elapsedSeconds: 0,
        events: [],
      },
      votes: [],
      createdAt: new Date().toISOString(),
    };

    db.peladas.unshift(newPelada);
    saveDb(db);
    res.status(201).json({ pelada: newPelada });
  });

  app.put('/api/peladas/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const idx = db.peladas.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const current = db.peladas[idx];
    const body = req.body as Record<string, unknown>;
    const activeIds = new Set(db.users.filter((u) => u.active).map((u) => u.id));

    const presentPlayerIds = Array.isArray(body.presentPlayerIds)
      ? body.presentPlayerIds.filter((pid): pid is string => typeof pid === 'string' && activeIds.has(pid))
      : current.presentPlayerIds;

    const teamCount = body.teamCount !== undefined
      ? Math.max(2, Math.min(4, Number(body.teamCount) || current.teamCount))
      : current.teamCount;

    const updated: PeladaSession = {
      ...current,
      title: typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 100)
        : current.title,
      date: typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : current.date,
      time: typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time)
        ? body.time
        : current.time,
      location: typeof body.location === 'string' && body.location.trim()
        ? body.location.trim().slice(0, 120)
        : current.location,
      teamCount,
      presentPlayerIds,
    };

    db.peladas[idx] = updated;
    saveDb(db);
    res.json({ pelada: updated });
  });

  app.delete('/api/peladas/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    if (!db.peladas.some((p) => p.id === id)) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    db.peladas = db.peladas.filter((p) => p.id !== id);
    saveDb(db);
    res.json({ deletedId: id });
  });

  app.post('/api/peladas/:id/attendance', requireAuth, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const isAdmin = req.session?.role === 'admin';
    const targetPlayerId =
      isAdmin && typeof req.body?.playerId === 'string'
        ? req.body.playerId
        : req.session?.sub;

    if (!targetPlayerId) {
      res.status(400).json({ error: 'Jogador inválido.' });
      return;
    }

    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status === 'completed') {
      res.status(400).json({ error: 'Pelada já concluída.' });
      return;
    }

    const exists = pelada.presentPlayerIds.includes(targetPlayerId);
    if (exists) {
      pelada.presentPlayerIds = pelada.presentPlayerIds.filter((pid) => pid !== targetPlayerId);
      for (const team of pelada.teams) {
        team.playerIds = team.playerIds.filter((pid) => pid !== targetPlayerId);
      }
    } else {
      pelada.presentPlayerIds.push(targetPlayerId);
    }

    saveDb(db);
    res.json({ pelada });
  });

  app.post('/api/peladas/:id/draw-teams', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const teamCount = req.body?.teamCount !== undefined
      ? Math.max(2, Math.min(4, Number(req.body.teamCount) || pelada.teamCount))
      : pelada.teamCount;

    pelada.teamCount = teamCount;
    const presentPlayers = db.users
      .filter((u) => u.active && pelada.presentPlayerIds.includes(u.id))
      .map(sanitizeUser);

    pelada.teams = drawBalancedTeams(presentPlayers, teamCount);
    pelada.live.homeTeamId = pelada.teams[0]?.id || 'team-a';
    pelada.live.awayTeamId = pelada.teams[1]?.id || 'team-b';

    saveDb(db);
    res.json({ pelada });
  });

  app.put('/api/peladas/:id/teams', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const incomingTeams = req.body?.teams;
    if (!Array.isArray(incomingTeams) || incomingTeams.length < 2) {
      res.status(400).json({ error: 'É necessário enviar pelo menos 2 times.' });
      return;
    }

    const presentSet = new Set(pelada.presentPlayerIds);
    const assigned = new Set<string>();
    const sanitizedTeams: TeamRoster[] = [];

    for (const rawTeam of incomingTeams) {
      if (!rawTeam || typeof rawTeam !== 'object') continue;
      const t = rawTeam as TeamRoster;
      const validIds: string[] = [];
      if (Array.isArray(t.playerIds)) {
        for (const pid of t.playerIds) {
          if (typeof pid === 'string' && presentSet.has(pid) && !assigned.has(pid)) {
            assigned.add(pid);
            validIds.push(pid);
          }
        }
      }
      sanitizedTeams.push({
        id: String(t.id),
        name: String(t.name).slice(0, 30),
        color: t.color || 'emerald',
        playerIds: validIds,
      });
    }

    pelada.teams = sanitizedTeams;
    saveDb(db);
    res.json({ pelada });
  });

  // Live Match Controls
  app.post('/api/peladas/:id/live/control', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const action = req.body?.action;
    const now = Date.now();

    if (action === 'start') {
      pelada.status = 'live';
      if (!pelada.live.isRunning) {
        pelada.live.isRunning = true;
        pelada.live.lastStartedAt = now;
      }
    } else if (action === 'pause') {
      if (pelada.live.isRunning && pelada.live.lastStartedAt) {
        const delta = Math.max(0, Math.floor((now - pelada.live.lastStartedAt) / 1000));
        pelada.live.elapsedSeconds += delta;
      }
      pelada.live.isRunning = false;
      pelada.live.lastStartedAt = undefined;
    } else if (action === 'next_game') {
      pelada.live.homeScore = 0;
      pelada.live.awayScore = 0;
      pelada.live.elapsedSeconds = 0;
      pelada.live.isRunning = false;
      pelada.live.lastStartedAt = undefined;
      if (typeof req.body?.homeTeamId === 'string') {
        pelada.live.homeTeamId = req.body.homeTeamId;
      }
      if (typeof req.body?.awayTeamId === 'string') {
        pelada.live.awayTeamId = req.body.awayTeamId;
      }
    } else if (action === 'set_matchup') {
      const homeTeamId = String(req.body?.homeTeamId || '');
      const awayTeamId = String(req.body?.awayTeamId || '');
      if (
        homeTeamId &&
        awayTeamId &&
        homeTeamId !== awayTeamId &&
        pelada.teams.some((t) => t.id === homeTeamId) &&
        pelada.teams.some((t) => t.id === awayTeamId)
      ) {
        pelada.live.homeTeamId = homeTeamId;
        pelada.live.awayTeamId = awayTeamId;
      } else {
        res.status(400).json({ error: 'Selecione dois times diferentes válidos.' });
        return;
      }
    } else if (action === 'finish_pelada') {
      if (pelada.live.isRunning && pelada.live.lastStartedAt) {
        const delta = Math.max(0, Math.floor((now - pelada.live.lastStartedAt) / 1000));
        pelada.live.elapsedSeconds += delta;
      }
      pelada.live.isRunning = false;
      pelada.live.lastStartedAt = undefined;
      pelada.status = 'completed';
    } else if (action === 'reopen_live') {
      pelada.status = 'live';
    } else {
      res.status(400).json({ error: 'Ação inválida.' });
      return;
    }

    saveDb(db);
    res.json({ pelada });
  });

  app.post('/api/peladas/:id/live/event', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const type = req.body?.type as MatchEventType;
    const teamId = String(req.body?.teamId || '');
    const playerId = String(req.body?.playerId || '');
    const assistPlayerId =
      typeof req.body?.assistPlayerId === 'string' && req.body.assistPlayerId
        ? req.body.assistPlayerId
        : undefined;

    if (!['goal', 'assist', 'save'].includes(type)) {
      res.status(400).json({ error: 'Tipo de lance inválido.' });
      return;
    }
    if (!pelada.teams.some((t) => t.id === teamId)) {
      res.status(400).json({ error: 'Time inválido.' });
      return;
    }
    if (!pelada.presentPlayerIds.includes(playerId)) {
      res.status(400).json({ error: 'Jogador não está na lista de presentes.' });
      return;
    }

    const now = Date.now();
    const currentSeconds =
      pelada.live.elapsedSeconds +
      (pelada.live.isRunning && pelada.live.lastStartedAt
        ? Math.max(0, Math.floor((now - pelada.live.lastStartedAt) / 1000))
        : 0);

    const minute = Math.max(1, Math.ceil(currentSeconds / 60));

    const event: MatchEvent = {
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type,
      teamId,
      playerId,
      assistPlayerId:
        type === 'goal' && assistPlayerId && assistPlayerId !== playerId
          ? assistPlayerId
          : undefined,
      minute,
      createdAt: new Date().toISOString(),
    };

    pelada.status = 'live';
    pelada.live.events.unshift(event);
    if (type === 'goal') {
      if (teamId === pelada.live.homeTeamId) {
        pelada.live.homeScore += 1;
      } else if (teamId === pelada.live.awayTeamId) {
        pelada.live.awayScore += 1;
      }
    }

    saveDb(db);
    res.status(201).json({ pelada, event });
  });

  app.delete('/api/peladas/:id/live/event/:eventId', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const eventId = String(req.params.eventId);
    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const ev = pelada.live.events.find((e) => e.id === eventId);
    if (!ev) {
      res.status(404).json({ error: 'Lance não encontrado.' });
      return;
    }

    if (ev.type === 'goal') {
      if (ev.teamId === pelada.live.homeTeamId && pelada.live.homeScore > 0) {
        pelada.live.homeScore -= 1;
      } else if (ev.teamId === pelada.live.awayTeamId && pelada.live.awayScore > 0) {
        pelada.live.awayScore -= 1;
      }
    }

    pelada.live.events = pelada.live.events.filter((e) => e.id !== eventId);
    saveDb(db);
    res.json({ pelada });
  });

  // Post-Match Voting
  app.post('/api/peladas/:id/vote', requireAuth, (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const voterId = req.session?.sub;
    const targetPlayerId = String(req.body?.targetPlayerId || '');

    if (!voterId) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const db = getDb();
    const pelada = db.peladas.find((p) => p.id === id);
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    if (pelada.status !== 'completed') {
      res.status(400).json({
        error: 'A votação só é liberada após a conclusão da pelada.',
      });
      return;
    }

    if (!pelada.presentPlayerIds.includes(voterId)) {
      res.status(403).json({
        error: 'Apenas peladeiros presentes nesta partida podem votar.',
      });
      return;
    }

    if (voterId === targetPlayerId) {
      res.status(400).json({
        error: 'Regra da pelada: não é permitido votar em si mesmo.',
      });
      return;
    }

    if (!pelada.presentPlayerIds.includes(targetPlayerId)) {
      res.status(400).json({
        error: 'O atleta escolhido não participou desta pelada.',
      });
      return;
    }

    const existingIdx = pelada.votes.findIndex((v) => v.voterId === voterId);
    const voteRecord = {
      voterId,
      targetPlayerId,
      createdAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      pelada.votes[existingIdx] = voteRecord;
    } else {
      pelada.votes.push(voteRecord);
    }

    saveDb(db);
    const stats = computeStats(db.peladas, db.users);
    res.json({ pelada, stats });
  });

  return app;
}
