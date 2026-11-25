import crypto from 'node:crypto';
import express, { type Response } from 'express';
import type {
  AvailableUserOption,
  BloodType,
  DominantFoot,
  FinanceCategory,
  FinanceEntry,
  FinanceType,
  FutsalPosition,
  GroupMember,
  GroupSummary,
  MatchEvent,
  MatchEventType,
  PeladaGroup,
  PeladaSession,
  PendingUserSummary,
  PlayerProfile,
  PlayerStatsSummary,
  PublicGroupOption,
  SkillRatings,
  TeamRoster,
  UserRole,
} from '../src/types.ts';
import { getAttendanceDeadlineMs } from '../src/utils/peladaTime.ts';
import {
  type AuthenticatedRequest,
  createSessionToken,
  hashPin,
  requireAuth,
  verifyPin,
} from './auth.ts';
import {
  type AppDatabase,
  computeFinalRating,
  drawBalancedTeams,
  getDb,
  getGroupMemberProfiles,
  sanitizeUser,
  saveDb,
  syncRecurringPeladas,
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

function computeStats(
  peladas: PeladaSession[],
  members: PlayerProfile[],
): Record<string, PlayerStatsSummary> {
  const stats: Record<string, PlayerStatsSummary> = {};
  for (const m of members) {
    stats[m.id] = {
      playerId: m.id,
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

function getGroupContext(
  db: AppDatabase,
  groupId: string,
  userId: string,
  res: Response,
  requireAdminRole = false,
): { group: PeladaGroup; membership: GroupMember; user: StoredUser } | null {
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.active) {
    res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
    return null;
  }

  const group = db.groups.find((g) => g.id === groupId);
  if (!group) {
    res.status(404).json({ error: 'Pelada fixa não encontrada.' });
    return null;
  }

  const membership = group.members.find((m) => m.playerId === userId);
  if (!membership || !membership.active) {
    res.status(403).json({
      error: 'Você não participa desta pelada fixa. Entre no grupo para acessar.',
    });
    return null;
  }

  if (requireAdminRole && membership.role !== 'admin') {
    res.status(403).json({
      error: 'Ação restrita aos administradores desta pelada.',
    });
    return null;
  }

  return { group, membership, user };
}

function buildGroupSummaries(db: AppDatabase, userId: string): GroupSummary[] {
  const userMap = new Map(db.users.map((u) => [u.id, u]));
  return db.groups
    .map((group) => {
      const membership = group.members.find(
        (m) => m.playerId === userId && m.active,
      );
      const isMember = Boolean(membership);
      const activeMembers = group.members.filter((m) => {
        const u = userMap.get(m.playerId);
        return Boolean(u && u.active && m.active);
      });
      const adminCount = activeMembers.filter((m) => m.role === 'admin').length;
      const creator = userMap.get(group.createdBy);

      const groupPeladas = db.peladas
        .filter((p) => p.groupId === group.id && p.status !== 'cancelled')
        .sort((a, b) => a.date.localeCompare(b.date));
      const nextMatch =
        groupPeladas.find((p) => p.status === 'live') ||
        groupPeladas.find((p) => p.status === 'scheduled') ||
        groupPeladas[groupPeladas.length - 1];

      let balance: number | undefined;
      if (isMember) {
        balance = db.finance
          .filter((f) => f.groupId === group.id)
          .reduce(
            (acc, entry) =>
              entry.type === 'income' ? acc + entry.amount : acc - entry.amount,
            0,
          );
      }

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        dayOfWeek: group.dayOfWeek,
        time: group.time,
        location: group.location,
        teamCount: group.teamCount,
        playersPerTeam: group.playersPerTeam || 5,
        autoSchedule: group.autoSchedule,
        memberCount: activeMembers.length,
        adminCount,
        creatorName: creator?.name || 'Organizador',
        isMember,
        myRole: membership ? membership.role : null,
        nextMatchDate: nextMatch?.date,
        nextMatchTime: nextMatch?.time,
        nextMatchStatus: nextMatch?.status,
        balance,
      };
    })
    .sort((a, b) => {
      if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
}

function buildGroupWorkspace(db: AppDatabase, group: PeladaGroup) {
  const members = getGroupMemberProfiles(db, group);
  const memberIds = new Set(group.members.map((m) => m.playerId));
  const availableUsers: AvailableUserOption[] = db.users
    .filter((u) => u.active && !memberIds.has(u.id))
    .map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      avatarUrl: u.avatarUrl,
      preferredPosition: u.preferredPosition,
      dominantFoot: u.dominantFoot,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const finance = db.finance
    .filter((f) => f.groupId === group.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const peladas = db.peladas
    .filter((p) => p.groupId === group.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const stats = computeStats(peladas, members);

  return {
    group,
    members,
    availableUsers,
    finance,
    peladas,
    stats,
  };
}

function getAdminGroupIds(db: AppDatabase, userId: string): Set<string> {
  return new Set(
    db.groups
      .filter((g) =>
        g.members.some(
          (m) => m.playerId === userId && m.active && m.role === 'admin',
        ),
      )
      .map((g) => g.id),
  );
}

function buildPendingUsersForAdmin(
  db: AppDatabase,
  adminGroupIds: Set<string>,
): PendingUserSummary[] {
  if (adminGroupIds.size === 0) return [];
  const groupNameMap = new Map(db.groups.map((g) => [g.id, g.name]));
  return db.users
    .filter((u) => {
      if (u.approvalStatus !== 'pending') return false;
      const reqIds = Array.isArray(u.requestedGroupIds) ? u.requestedGroupIds : [];
      if (reqIds.length === 0) return true;
      return reqIds.some((gid) => adminGroupIds.has(gid));
    })
    .map((u) => {
      const reqIds = Array.isArray(u.requestedGroupIds) ? u.requestedGroupIds : [];
      return {
        id: u.id,
        username: u.username,
        name: u.name,
        preferredPosition: u.preferredPosition,
        dominantFoot: u.dominantFoot,
        requestedGroupIds: reqIds,
        requestedGroupNames: reqIds
          .map((gid) => groupNameMap.get(gid))
          .filter((name): name is string => Boolean(name)),
        requestedNotes: u.requestedNotes || '',
        createdAt: u.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public list of fixed peladas (minimal safe metadata for registration preference)
  app.get('/api/auth/public-groups', (_req, res) => {
    const db = getDb();
    const groups: PublicGroupOption[] = db.groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        dayOfWeek: g.dayOfWeek,
        time: g.time,
        location: g.location,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ groups });
  });

  // Authentication & Registration
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

    if (user.approvalStatus === 'pending') {
      res.status(403).json({
        error:
          'Seu cadastro está aguardando aprovação de um administrador e indicação da sua pelada fixa.',
      });
      return;
    }

    if (user.approvalStatus === 'rejected') {
      res.status(403).json({
        error: 'Sua solicitação de cadastro não foi aprovada pelo administrador.',
      });
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
    });

    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/register', (req, res) => {
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
      res.status(400).json({ error: 'Informe seu nome completo.' });
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      res.status(400).json({ error: 'A senha deve conter exatamente 6 dígitos numéricos.' });
      return;
    }

    const db = getDb();
    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      res.status(409).json({ error: `O login "${username}" já está cadastrado.` });
      return;
    }

    const validGroupIds = new Set(db.groups.map((g) => g.id));
    const rawRequestedIds = Array.isArray(body.requestedGroupIds)
      ? body.requestedGroupIds.filter((gid): gid is string => typeof gid === 'string')
      : typeof body.requestedGroupId === 'string' && body.requestedGroupId.trim()
        ? [body.requestedGroupId.trim()]
        : [];
    const requestedGroupIds = rawRequestedIds.filter((gid) => validGroupIds.has(gid));
    const requestedNotes =
      typeof body.requestedNotes === 'string'
        ? body.requestedNotes.trim().slice(0, 200)
        : '';

    const dominantFoot: DominantFoot = VALID_FEET.includes(body.dominantFoot as DominantFoot)
      ? (body.dominantFoot as DominantFoot)
      : 'Destro';
    const preferredPosition: FutsalPosition = VALID_POSITIONS.includes(
      body.preferredPosition as FutsalPosition,
    )
      ? (body.preferredPosition as FutsalPosition)
      : 'Ala Direito';

    const defaultSkills: SkillRatings = {
      habilidade: 7,
      preparoFisico: 7,
      chute: 7,
      defesa: 7,
      ataque: 7,
    };
    const { hash, salt } = hashPin(pin);

    const newUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      username,
      name,
      role: 'player',
      active: false,
      approvalStatus: 'pending',
      requestedGroupIds,
      requestedNotes,
      avatarUrl: '',
      address: '',
      dominantFoot,
      preferredPosition,
      health: {
        emergencyContact: '',
        healthPlan: '',
        bloodType: 'Não informado',
        healthIssues: 'Nenhum',
        continuousMedication: 'Nenhum',
      },
      selfSkills: defaultSkills,
      adminSkills: defaultSkills,
      finalRating: computeFinalRating(defaultSkills),
      adminReviewed: false,
      createdAt: new Date().toISOString(),
      pinHash: hash,
      pinSalt: salt,
    };

    db.users.push(newUser);
    saveDb(db);

    res.status(201).json({
      pendingApproval: true,
      message:
        'Solicitação enviada para aprovação! Assim que um administrador aprovar seu cadastro e indicar sua pelada, você poderá acessar com seu login e senha.',
      user: sanitizeUser(newUser),
    });
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

  // Update own global profile (for editing own ficha from Hub or workspace)
  app.put('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.session?.sub;
    const db = getDb();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx === -1) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
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

    const rawHealth = (body.health && typeof body.health === 'object'
      ? body.health
      : {}) as Record<string, unknown>;

    const nextSelfSkills = body.selfSkills
      ? normalizeSkills(body.selfSkills, current.selfSkills)
      : current.selfSkills;

    const updated: StoredUser = {
      ...current,
      name:
        typeof body.name === 'string' && body.name.trim().length >= 2
          ? body.name.trim().slice(0, 80)
          : current.name,
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
      pinHash: nextPinHash,
      pinSalt: nextPinSalt,
    };

    db.users[idx] = updated;
    saveDb(db);
    res.json({ user: sanitizeUser(updated) });
  });

  // Create a new player account (with login & 6-digit PIN) and optionally enroll in admin's fixed peladas
  app.post('/api/users', requireAuth, (req: AuthenticatedRequest, res) => {
    const requesterId = req.session!.sub;
    const db = getDb();
    const requester = db.users.find((u) => u.id === requesterId && u.active);
    if (!requester) {
      res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      return;
    }

    const adminGroupIds = new Set(
      db.groups
        .filter((g) =>
          g.members.some(
            (m) => m.playerId === requesterId && m.active && m.role === 'admin',
          ),
        )
        .map((g) => g.id),
    );

    if (adminGroupIds.size === 0) {
      res.status(403).json({
        error: 'Apenas administradores de pelada podem cadastrar novos peladeiros.',
      });
      return;
    }

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

    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      res.status(409).json({
        error: `O login "${username}" já está cadastrado na plataforma.`,
      });
      return;
    }

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
      role: 'player',
      active: true,
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

    const requestedGroupIds = Array.isArray(body.groupIds)
      ? body.groupIds.filter((gid): gid is string => typeof gid === 'string')
      : [];
    const memberRole: UserRole = body.role === 'admin' ? 'admin' : 'player';
    const addedGroupIds: string[] = [];

    for (const gid of requestedGroupIds) {
      if (!adminGroupIds.has(gid)) continue;
      const group = db.groups.find((g) => g.id === gid);
      if (!group) continue;
      if (!group.members.some((m) => m.playerId === newUser.id)) {
        group.members.push({
          playerId: newUser.id,
          role: memberRole,
          active: true,
          adminSkills,
          finalRating: computeFinalRating(adminSkills),
          adminReviewed: true,
          joinedAt: new Date().toISOString(),
        });
        addedGroupIds.push(gid);
      }
    }

    saveDb(db);
    res.status(201).json({ user: sanitizeUser(newUser), addedGroupIds });
  });

  // ==========================================
  // PENDING ACCOUNT APPROVALS (ADMIN ONLY)
  // ==========================================

  app.get('/api/pending-users', requireAuth, (req: AuthenticatedRequest, res) => {
    const requesterId = req.session!.sub;
    const db = getDb();
    const requester = db.users.find((u) => u.id === requesterId && u.active);
    if (!requester) {
      res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      return;
    }

    const adminGroupIds = getAdminGroupIds(db, requesterId);
    if (adminGroupIds.size === 0) {
      res.json({ pendingUsers: [] });
      return;
    }

    const pendingUsers = buildPendingUsersForAdmin(db, adminGroupIds);
    res.json({ pendingUsers });
  });

  app.post('/api/pending-users/:userId/approve', requireAuth, (req: AuthenticatedRequest, res) => {
    const requesterId = req.session!.sub;
    const targetUserId = String(req.params.userId);
    const db = getDb();
    const requester = db.users.find((u) => u.id === requesterId && u.active);
    if (!requester) {
      res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      return;
    }

    const adminGroupIds = getAdminGroupIds(db, requesterId);
    if (adminGroupIds.size === 0) {
      res.status(403).json({
        error: 'Apenas administradores de pelada podem aprovar novos cadastros.',
      });
      return;
    }

    const targetUser = db.users.find((u) => u.id === targetUserId);
    if (!targetUser || targetUser.approvalStatus !== 'pending') {
      res.status(404).json({
        error: 'Solicitação de cadastro pendente não encontrada.',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const rawGroupIds = Array.isArray(body.groupIds)
      ? body.groupIds.filter((gid): gid is string => typeof gid === 'string')
      : typeof body.groupId === 'string' && body.groupId.trim()
        ? [body.groupId.trim()]
        : [];
    const uniqueGroupIds = Array.from(new Set(rawGroupIds));

    if (uniqueGroupIds.length === 0) {
      res.status(400).json({
        error: 'Indique pelo menos uma pelada fixa para o peladeiro fazer parte.',
      });
      return;
    }

    for (const gid of uniqueGroupIds) {
      if (!adminGroupIds.has(gid)) {
        res.status(403).json({
          error: 'Você só pode indicar peladas das quais é administrador.',
        });
        return;
      }
    }

    const assignedRole: UserRole = body.role === 'admin' ? 'admin' : 'player';
    targetUser.active = true;
    targetUser.approvalStatus = 'approved';

    const addedGroupIds: string[] = [];
    for (const gid of uniqueGroupIds) {
      const group = db.groups.find((g) => g.id === gid);
      if (!group) continue;
      const existingMember = group.members.find((m) => m.playerId === targetUser.id);
      if (existingMember) {
        existingMember.active = true;
        existingMember.role = assignedRole;
      } else {
        const skills = { ...targetUser.selfSkills };
        group.members.push({
          playerId: targetUser.id,
          role: assignedRole,
          active: true,
          adminSkills: skills,
          finalRating: computeFinalRating(skills),
          adminReviewed: true,
          joinedAt: new Date().toISOString(),
        });
      }
      addedGroupIds.push(gid);
    }

    saveDb(db);
    res.json({
      user: sanitizeUser(targetUser),
      addedGroupIds,
    });
  });

  app.post('/api/pending-users/:userId/reject', requireAuth, (req: AuthenticatedRequest, res) => {
    const requesterId = req.session!.sub;
    const targetUserId = String(req.params.userId);
    const db = getDb();
    const requester = db.users.find((u) => u.id === requesterId && u.active);
    if (!requester) {
      res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      return;
    }

    const adminGroupIds = getAdminGroupIds(db, requesterId);
    if (adminGroupIds.size === 0) {
      res.status(403).json({
        error: 'Apenas administradores podem recusar solicitações de cadastro.',
      });
      return;
    }

    const targetUser = db.users.find((u) => u.id === targetUserId);
    if (!targetUser || targetUser.approvalStatus !== 'pending') {
      res.status(404).json({
        error: 'Solicitação de cadastro pendente não encontrada.',
      });
      return;
    }

    const reqIds = Array.isArray(targetUser.requestedGroupIds)
      ? targetUser.requestedGroupIds
      : [];
    if (reqIds.length > 0 && !reqIds.some((gid) => adminGroupIds.has(gid))) {
      res.status(403).json({
        error: 'Apenas administradores da pelada indicada podem recusar esta solicitação.',
      });
      return;
    }

    targetUser.active = false;
    targetUser.approvalStatus = 'rejected';
    saveDb(db);
    res.json({ rejectedId: targetUser.id });
  });

  // ==========================================
  // PELADAS FIXAS (MULTI-GROUP HUB & SETTINGS)
  // ==========================================

  // List all fixed peladas (first page for authenticated users)
  app.get('/api/groups', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    syncRecurringPeladas(db);
    const groups = buildGroupSummaries(db, req.session!.sub);
    res.json({ groups });
  });

  // Create a new fixed pelada — ANY authenticated user can create and becomes Admin of THAT pelada!
  app.post('/api/groups', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.session!.sub;
    const db = getDb();
    const creator = db.users.find((u) => u.id === userId && u.active);
    if (!creator) {
      res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (name.length < 2) {
      res.status(400).json({ error: 'Informe um nome válido para a pelada fixa.' });
      return;
    }

    const description =
      typeof body.description === 'string' ? body.description.trim().slice(0, 240) : '';
    const dayOfWeek = Math.max(0, Math.min(6, Number(body.dayOfWeek) || 0));
    const time =
      typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time)
        ? body.time
        : '20:30';
    const location =
      typeof body.location === 'string' && body.location.trim()
        ? body.location.trim().slice(0, 120)
        : 'Quadra Principal';
    const teamCount = Math.max(2, Math.min(6, Number(body.teamCount) || 2));
    const playersPerTeam = Math.max(3, Math.min(10, Number(body.playersPerTeam) || 5));
    const autoSchedule = body.autoSchedule === undefined ? true : Boolean(body.autoSchedule);

    const creatorSkills = { ...creator.selfSkills };
    const newGroup: PeladaGroup = {
      id: `grp-${crypto.randomUUID().slice(0, 8)}`,
      name,
      description,
      dayOfWeek,
      time,
      location,
      teamCount,
      playersPerTeam,
      autoSchedule,
      createdBy: creator.id,
      createdAt: new Date().toISOString(),
      members: [
        {
          playerId: creator.id,
          role: 'admin',
          active: true,
          adminSkills: creatorSkills,
          finalRating: computeFinalRating(creatorSkills),
          adminReviewed: true,
          joinedAt: new Date().toISOString(),
        },
      ],
    };

    db.groups.push(newGroup);
    syncRecurringPeladas(db);
    saveDb(db);

    const summary = buildGroupSummaries(db, userId).find((g) => g.id === newGroup.id);
    res.status(201).json({ group: newGroup, summary });
  });

  // Join an existing fixed pelada as a regular player
  app.post('/api/groups/:groupId/join', requireAuth, (req: AuthenticatedRequest, res) => {
    const groupId = String(req.params.groupId);
    const userId = req.session!.sub;
    const db = getDb();
    const user = db.users.find((u) => u.id === userId && u.active);
    if (!user) {
      res.status(401).json({ error: 'Usuário inválido ou inativo.' });
      return;
    }

    const group = db.groups.find((g) => g.id === groupId);
    if (!group) {
      res.status(404).json({ error: 'Pelada fixa não encontrada.' });
      return;
    }

    const existing = group.members.find((m) => m.playerId === userId);
    if (existing) {
      existing.active = true;
    } else {
      const skills = { ...user.selfSkills };
      group.members.push({
        playerId: userId,
        role: 'player',
        active: true,
        adminSkills: skills,
        finalRating: computeFinalRating(skills),
        adminReviewed: false,
        joinedAt: new Date().toISOString(),
      });
    }

    saveDb(db);
    res.json({ workspace: buildGroupWorkspace(db, group) });
  });

  // Full isolated workspace for a fixed pelada
  app.get('/api/groups/:groupId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    syncRecurringPeladas(db);
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res);
    if (!ctx) return;

    res.json(buildGroupWorkspace(db, ctx.group));
  });

  // Update fixed pelada settings (group admin only)
  app.put('/api/groups/:groupId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const body = req.body as Record<string, unknown>;
    const { group } = ctx;

    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      group.name = body.name.trim().slice(0, 100);
    }
    if (typeof body.description === 'string') {
      group.description = body.description.trim().slice(0, 240);
    }
    if (body.dayOfWeek !== undefined) {
      group.dayOfWeek = Math.max(0, Math.min(6, Number(body.dayOfWeek) || 0));
    }
    if (typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time)) {
      group.time = body.time;
    }
    if (typeof body.location === 'string' && body.location.trim()) {
      group.location = body.location.trim().slice(0, 120);
    }
    if (body.teamCount !== undefined) {
      group.teamCount = Math.max(2, Math.min(6, Number(body.teamCount) || 2));
    }
    if (body.playersPerTeam !== undefined) {
      group.playersPerTeam = Math.max(3, Math.min(10, Number(body.playersPerTeam) || 5));
    }
    if (typeof body.autoSchedule === 'boolean') {
      group.autoSchedule = body.autoSchedule;
    }

    syncRecurringPeladas(db);
    saveDb(db);
    res.json(buildGroupWorkspace(db, group));
  });

  // Delete fixed pelada (group admin only)
  app.delete('/api/groups/:groupId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const groupId = ctx.group.id;
    db.groups = db.groups.filter((g) => g.id !== groupId);
    db.finance = db.finance.filter((f) => f.groupId !== groupId);
    db.peladas = db.peladas.filter((p) => p.groupId !== groupId);
    saveDb(db);
    res.json({ deletedId: groupId });
  });

  // ==========================================
  // GROUP MEMBERS, ADMINS ELECTION & HEALTH
  // ==========================================

  // Add existing user OR create a new user directly into this pelada (group admin only)
  app.post('/api/groups/:groupId/members', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const { group } = ctx;
    const body = req.body as Record<string, unknown>;
    const role: UserRole = body.role === 'admin' ? 'admin' : 'player';

    // Mode 1: Add existing platform user
    if (typeof body.existingUserId === 'string' && body.existingUserId.trim()) {
      const targetUser = db.users.find((u) => u.id === body.existingUserId && u.active);
      if (!targetUser) {
        res.status(404).json({ error: 'Usuário não encontrado no sistema.' });
        return;
      }
      const existingMember = group.members.find((m) => m.playerId === targetUser.id);
      if (existingMember) {
        existingMember.active = true;
        existingMember.role = role;
      } else {
        const skills = { ...targetUser.selfSkills };
        group.members.push({
          playerId: targetUser.id,
          role,
          active: true,
          adminSkills: skills,
          finalRating: computeFinalRating(skills),
          adminReviewed: true,
          joinedAt: new Date().toISOString(),
        });
      }
      saveDb(db);
      res.status(201).json(buildGroupWorkspace(db, group));
      return;
    }

    // Mode 2: Create a brand-new user account and add to this pelada
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

    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      res.status(409).json({
        error: `O login "${username}" já está cadastrado. Use a opção "Adicionar atleta já cadastrado".`,
      });
      return;
    }

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
      role: 'player',
      active: true,
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
    group.members.push({
      playerId: newUser.id,
      role,
      active: body.active === undefined ? true : Boolean(body.active),
      adminSkills,
      finalRating: computeFinalRating(adminSkills),
      adminReviewed: true,
      joinedAt: new Date().toISOString(),
    });
    saveDb(db);
    res.status(201).json(buildGroupWorkspace(db, group));
  });

  // Update member in this pelada (elect/remove admin, edit skills, edit profile/health)
  app.put('/api/groups/:groupId/members/:playerId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res);
    if (!ctx) return;

    const targetId = String(req.params.playerId);
    const { group, membership: requesterMembership } = ctx;
    const isAdmin = requesterMembership.role === 'admin';
    const isSelf = req.session!.sub === targetId;

    if (!isAdmin && !isSelf) {
      res.status(403).json({
        error: 'Você só pode editar a sua própria ficha de peladeiro.',
      });
      return;
    }

    const memberIdx = group.members.findIndex((m) => m.playerId === targetId);
    const userIdx = db.users.findIndex((u) => u.id === targetId);
    if (memberIdx === -1 || userIdx === -1) {
      res.status(404).json({ error: 'Peladeiro não encontrado nesta pelada.' });
      return;
    }

    const currentMember = group.members[memberIdx];
    const currentUser = db.users[userIdx];
    const body = req.body as Record<string, unknown>;

    if (body.avatarUrl !== undefined && !isSafeImageUrl(body.avatarUrl)) {
      res.status(400).json({ error: 'Formato de imagem inválido ou muito grande.' });
      return;
    }

    // Only allow PIN updates by the account owner themselves (or if user only belongs to this group and admin updates)
    const groupsWithUser = db.groups.filter((g) =>
      g.members.some((m) => m.playerId === targetId),
    );
    let nextPinHash = currentUser.pinHash;
    let nextPinSalt = currentUser.pinSalt;
    if (typeof body.pin === 'string' && body.pin.trim() !== '') {
      if (!isSelf && groupsWithUser.length > 1) {
        res.status(403).json({
          error: 'Como este atleta participa de outras peladas, apenas ele mesmo pode alterar a própria senha.',
        });
        return;
      }
      const trimmedPin = body.pin.trim();
      if (!/^\d{6}$/.test(trimmedPin)) {
        res.status(400).json({ error: 'A senha deve ter exatamente 6 dígitos numéricos.' });
        return;
      }
      const hashed = hashPin(trimmedPin);
      nextPinHash = hashed.hash;
      nextPinSalt = hashed.salt;
    }

    // Group-scoped role & active status (only admins of THIS pelada)
    let nextRole = currentMember.role;
    let nextActive = currentMember.active;
    if (isAdmin) {
      if (body.role === 'admin' || body.role === 'player') {
        nextRole = body.role;
      }
      if (typeof body.active === 'boolean') {
        nextActive = body.active;
      }
      const activeAdminsAfter = group.members.filter((m) => {
        const u = db.users.find((usr) => usr.id === m.playerId);
        if (!u || !u.active) return false;
        return m.playerId === targetId
          ? nextRole === 'admin' && nextActive
          : m.role === 'admin' && m.active;
      });
      if (activeAdminsAfter.length === 0) {
        res.status(400).json({
          error: 'Esta pelada precisa manter pelo menos um administrador ativo.',
        });
        return;
      }
    }

    const rawHealth = (body.health && typeof body.health === 'object'
      ? body.health
      : {}) as Record<string, unknown>;

    const nextSelfSkills = body.selfSkills
      ? normalizeSkills(body.selfSkills, currentUser.selfSkills)
      : currentUser.selfSkills;

    const nextAdminSkills =
      isAdmin && body.adminSkills
        ? normalizeSkills(body.adminSkills, currentMember.adminSkills)
        : currentMember.adminSkills;

    const nextAdminReviewed =
      isAdmin && body.adminSkills ? true : currentMember.adminReviewed;

    db.users[userIdx] = {
      ...currentUser,
      name:
        typeof body.name === 'string' && body.name.trim().length >= 2
          ? body.name.trim().slice(0, 80)
          : currentUser.name,
      avatarUrl:
        typeof body.avatarUrl === 'string'
          ? body.avatarUrl.trim()
          : currentUser.avatarUrl,
      address:
        typeof body.address === 'string'
          ? body.address.trim().slice(0, 200)
          : currentUser.address,
      dominantFoot: VALID_FEET.includes(body.dominantFoot as DominantFoot)
        ? (body.dominantFoot as DominantFoot)
        : currentUser.dominantFoot,
      preferredPosition: VALID_POSITIONS.includes(body.preferredPosition as FutsalPosition)
        ? (body.preferredPosition as FutsalPosition)
        : currentUser.preferredPosition,
      health: {
        emergencyContact:
          typeof rawHealth.emergencyContact === 'string'
            ? rawHealth.emergencyContact.trim().slice(0, 120)
            : currentUser.health.emergencyContact,
        healthPlan:
          typeof rawHealth.healthPlan === 'string'
            ? rawHealth.healthPlan.trim().slice(0, 100)
            : currentUser.health.healthPlan,
        bloodType: VALID_BLOOD_TYPES.includes(rawHealth.bloodType as BloodType)
          ? (rawHealth.bloodType as BloodType)
          : currentUser.health.bloodType,
        healthIssues:
          typeof rawHealth.healthIssues === 'string'
            ? rawHealth.healthIssues.trim().slice(0, 250)
            : currentUser.health.healthIssues,
        continuousMedication:
          typeof rawHealth.continuousMedication === 'string'
            ? rawHealth.continuousMedication.trim().slice(0, 250)
            : currentUser.health.continuousMedication,
      },
      selfSkills: nextSelfSkills,
      pinHash: nextPinHash,
      pinSalt: nextPinSalt,
    };

    group.members[memberIdx] = {
      ...currentMember,
      role: nextRole,
      active: nextActive,
      adminSkills: nextAdminSkills,
      finalRating: computeFinalRating(nextAdminSkills),
      adminReviewed: nextAdminReviewed,
    };

    saveDb(db);
    res.json(buildGroupWorkspace(db, group));
  });

  // Remove a player from this pelada (group admin only)
  app.delete('/api/groups/:groupId/members/:playerId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const targetId = String(req.params.playerId);
    const { group } = ctx;
    if (req.session!.sub === targetId) {
      res.status(400).json({ error: 'Você não pode remover a si mesmo desta pelada.' });
      return;
    }

    if (!group.members.some((m) => m.playerId === targetId)) {
      res.status(404).json({ error: 'Peladeiro não encontrado nesta pelada.' });
      return;
    }

    const remainingAdmins = group.members.filter(
      (m) => m.playerId !== targetId && m.role === 'admin' && m.active,
    );
    if (remainingAdmins.length === 0) {
      res.status(400).json({
        error: 'Não é possível remover o único administrador ativo desta pelada.',
      });
      return;
    }

    group.members = group.members.filter((m) => m.playerId !== targetId);
    for (const pel of db.peladas) {
      if (pel.groupId !== group.id) continue;
      pel.presentPlayerIds = pel.presentPlayerIds.filter((pid) => pid !== targetId);
      for (const team of pel.teams) {
        team.playerIds = team.playerIds.filter((pid) => pid !== targetId);
      }
    }

    saveDb(db);
    res.json(buildGroupWorkspace(db, group));
  });

  // ==========================================
  // SCOPED FINANCE PER PELADA
  // ==========================================

  app.post('/api/groups/:groupId/finance', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

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
      groupId: ctx.group.id,
      type,
      date,
      description,
      category,
      amount: Math.round(amount * 100) / 100,
      receiptUrl: receiptUrl || undefined,
      createdBy: req.session!.sub,
      createdAt: new Date().toISOString(),
    };

    db.finance.unshift(entry);
    saveDb(db);
    res.status(201).json({ entry });
  });

  app.delete('/api/groups/:groupId/finance/:entryId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const entryId = String(req.params.entryId);
    const exists = db.finance.some(
      (f) => f.id === entryId && f.groupId === ctx.group.id,
    );
    if (!exists) {
      res.status(404).json({ error: 'Lançamento financeiro não encontrado nesta pelada.' });
      return;
    }
    db.finance = db.finance.filter(
      (f) => !(f.id === entryId && f.groupId === ctx.group.id),
    );
    saveDb(db);
    res.json({ deletedId: entryId });
  });

  // ==========================================
  // SCOPED MATCH SESSIONS, TEAMS, LIVE & VOTING
  // ==========================================

  app.post('/api/groups/:groupId/peladas', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const { group } = ctx;
    const body = req.body as Record<string, unknown>;
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 100)
      : `${group.name}`;
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);
    const time = typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time)
      ? body.time
      : group.time;
    const scheduledAt =
      typeof body.scheduledAt === 'string' && Number.isFinite(Date.parse(body.scheduledAt))
        ? body.scheduledAt
        : undefined;
    const location = typeof body.location === 'string' && body.location.trim()
      ? body.location.trim().slice(0, 120)
      : group.location;
    const teamCount = Math.max(2, Math.min(6, Number(body.teamCount) || group.teamCount));
    const playersPerTeam = Math.max(
      3,
      Math.min(10, Number(body.playersPerTeam) || group.playersPerTeam || 5),
    );

    const groupMembers = getGroupMemberProfiles(db, group).filter((m) => m.active);
    const activeIds = new Set(groupMembers.map((m) => m.id));
    const presentPlayerIds = Array.isArray(body.presentPlayerIds)
      ? body.presentPlayerIds.filter((id): id is string => typeof id === 'string' && activeIds.has(id))
      : [];

    const presentPlayers = groupMembers.filter((m) => presentPlayerIds.includes(m.id));
    const drawResult = drawBalancedTeams(presentPlayers, teamCount, playersPerTeam);

    const newPelada: PeladaSession = {
      id: `pel-${crypto.randomUUID().slice(0, 8)}`,
      groupId: group.id,
      title,
      date,
      time,
      scheduledAt,
      location,
      teamCount,
      playersPerTeam,
      status: 'scheduled',
      presentPlayerIds,
      teams: drawResult.teams,
      adjustmentNote: drawResult.adjustmentNote,
      live: {
        homeTeamId: drawResult.teams[0]?.id || 'team-a',
        awayTeamId: drawResult.teams[1]?.id || 'team-b',
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

  app.delete('/api/groups/:groupId/peladas/:peladaId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const peladaId = String(req.params.peladaId);
    if (!db.peladas.some((p) => p.id === peladaId && p.groupId === ctx.group.id)) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    db.peladas = db.peladas.filter(
      (p) => !(p.id === peladaId && p.groupId === ctx.group.id),
    );
    saveDb(db);
    res.json({ deletedId: peladaId });
  });

  app.post('/api/groups/:groupId/peladas/:peladaId/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status === 'completed') {
      res.status(400).json({ error: 'Não é possível cancelar uma pelada já concluída.' });
      return;
    }

    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 200)
        : 'Cancelada pela administração';

    pelada.status = 'cancelled';
    pelada.live.isRunning = false;
    pelada.live.lastStartedAt = undefined;
    pelada.cancellationReason = reason;
    pelada.cancelledAt = new Date().toISOString();
    pelada.cancelledBy = req.session!.sub;

    saveDb(db);
    res.json({ pelada });
  });

  app.post('/api/groups/:groupId/peladas/:peladaId/reactivate', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status !== 'cancelled') {
      res.status(400).json({ error: 'Apenas peladas canceladas podem ser reativadas.' });
      return;
    }

    pelada.status = 'scheduled';
    pelada.cancellationReason = undefined;
    pelada.cancelledAt = undefined;
    pelada.cancelledBy = undefined;

    saveDb(db);
    res.json({ pelada });
  });

  app.post('/api/groups/:groupId/peladas/:peladaId/attendance', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res);
    if (!ctx) return;

    const isAdmin = ctx.membership.role === 'admin';
    const targetPlayerId =
      isAdmin && typeof req.body?.playerId === 'string'
        ? req.body.playerId
        : req.session!.sub;

    const memberExists = ctx.group.members.some(
      (m) => m.playerId === targetPlayerId && m.active,
    );
    if (!memberExists) {
      res.status(400).json({ error: 'Atleta não pertence a esta pelada.' });
      return;
    }

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Partida não encontrada.' });
      return;
    }
    if (pelada.status === 'cancelled') {
      res.status(400).json({ error: 'Esta pelada foi cancelada pela administração.' });
      return;
    }
    if (pelada.status === 'completed') {
      res.status(400).json({ error: 'Pelada já concluída.' });
      return;
    }

    const deadlineMs = getAttendanceDeadlineMs(pelada);
    if (!isAdmin && Date.now() > deadlineMs) {
      res.status(400).json({
        error: 'O prazo de confirmação encerrou 1 hora antes do início da pelada para o sorteio dos times.',
      });
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

  app.post('/api/groups/:groupId/peladas/:peladaId/draw-teams', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status === 'cancelled') {
      res.status(400).json({ error: 'Pelada cancelada não pode ter times sorteados.' });
      return;
    }

    const teamCount = req.body?.teamCount !== undefined
      ? Math.max(2, Math.min(6, Number(req.body.teamCount) || pelada.teamCount))
      : pelada.teamCount;
    const playersPerTeam = req.body?.playersPerTeam !== undefined
      ? Math.max(3, Math.min(10, Number(req.body.playersPerTeam) || pelada.playersPerTeam || 5))
      : (pelada.playersPerTeam || 5);

    pelada.teamCount = teamCount;
    pelada.playersPerTeam = playersPerTeam;

    const groupMembers = getGroupMemberProfiles(db, ctx.group).filter(
      (m) => m.active && pelada.presentPlayerIds.includes(m.id),
    );
    const drawResult = drawBalancedTeams(groupMembers, teamCount, playersPerTeam);
    pelada.teams = drawResult.teams;
    pelada.adjustmentNote = drawResult.adjustmentNote;
    pelada.live.homeTeamId = pelada.teams[0]?.id || 'team-a';
    pelada.live.awayTeamId = pelada.teams[1]?.id || 'team-b';

    saveDb(db);
    res.json({ pelada });
  });

  app.put('/api/groups/:groupId/peladas/:peladaId/teams', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status === 'cancelled') {
      res.status(400).json({ error: 'Pelada cancelada.' });
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
  app.post('/api/groups/:groupId/peladas/:peladaId/live/control', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status === 'cancelled') {
      res.status(400).json({ error: 'Esta pelada foi cancelada.' });
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

  app.post('/api/groups/:groupId/peladas/:peladaId/live/event', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }
    if (pelada.status === 'cancelled') {
      res.status(400).json({ error: 'Esta pelada foi cancelada.' });
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

  app.delete('/api/groups/:groupId/peladas/:peladaId/live/event/:eventId', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res, true);
    if (!ctx) return;

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const eventId = String(req.params.eventId);
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
  app.post('/api/groups/:groupId/peladas/:peladaId/vote', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ctx = getGroupContext(db, String(req.params.groupId), req.session!.sub, res);
    if (!ctx) return;

    const voterId = req.session!.sub;
    const targetPlayerId = String(req.body?.targetPlayerId || '');

    const pelada = db.peladas.find(
      (p) => p.id === String(req.params.peladaId) && p.groupId === ctx.group.id,
    );
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
    const members = getGroupMemberProfiles(db, ctx.group);
    const groupPeladas = db.peladas.filter((p) => p.groupId === ctx.group.id);
    const stats = computeStats(groupPeladas, members);
    res.json({ pelada, stats });
  });

  return app;
}
