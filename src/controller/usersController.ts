import { Response } from 'express';
import bcrypt from 'bcrypt';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

function normalizeUser(item: any) {
  if (!item) return item;

  return {
    ...item,
    accountId: item.account_id ?? item.accountId,
    photoUrl: item.photo_url ?? item.photoUrl ?? null,
    jobTitle: item.job_title ?? item.jobTitle ?? null,
    isActive: item.is_active ?? item.isActive ?? true,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
    password: undefined,
    password_hash: undefined,
  };
}

function normalizeMembership(item: any) {
  if (!item) return item;

  return {
    ...item,
    userId: item.user_id ?? item.userId,
    accountId: item.account_id ?? item.accountId,
    processId: item.process_id ?? item.processId,
    isActive: item.is_active ?? item.isActive ?? true,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
  };
}

function isValidUuid(value?: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findAll(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        name,
        email,
        role,
        cpf,
        phone,
        photo_url,
        department,
        job_title,
        position,
        is_active,
        notes,
        created_at,
        updated_at
      FROM users
      WHERE account_id = $1
      ORDER BY created_at DESC
      `,
      [accountId],
    );

    return res.json(result.rows.map(normalizeUser));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar usuários.',
      error: error.message,
    });
  }
}

async function findOne(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: `Usuário ${id} não encontrado`,
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        name,
        email,
        role,
        cpf,
        phone,
        photo_url,
        department,
        job_title,
        position,
        is_active,
        notes,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const item = result.rows[0];

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Usuário ${id} não encontrado`,
      });
    }

    return res.json(normalizeUser(item));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuário.',
      error: error.message,
    });
  }
}

async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;

    const existing = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [dto.email],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `E-mail "${dto.email}" já está cadastrado`,
      });
    }

    const rawPassword = String(dto.password ?? '').trim() || 'changeme';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const result = await db.query(
      `
      INSERT INTO users (
        account_id,
        name,
        email,
        password_hash,
        role,
        cpf,
        phone,
        photo_url,
        department,
        job_title,
        position,
        is_active,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING
        id,
        account_id,
        name,
        email,
        role,
        cpf,
        phone,
        photo_url,
        department,
        job_title,
        position,
        is_active,
        notes,
        created_at,
        updated_at
      `,
      [
        accountId,
        dto.name,
        dto.email,
        passwordHash,
        dto.role ?? 'user',
        dto.cpf ?? null,
        dto.phone ?? null,
        dto.photoUrl ?? null,
        dto.department ?? null,
        dto.jobTitle ?? null,
        dto.position ?? null,
        dto.isActive ?? true,
        dto.notes ?? null,
      ],
    );

    return res.status(201).json(normalizeUser(result.rows[0]));
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'E-mail já está em uso por outro usuário',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar usuário.',
      error: error.message,
    });
  }
}

async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: `Usuário ${id} não encontrado`,
      });
    }

    const currentResult = await db.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      return res.status(404).json({
        success: false,
        message: `Usuário ${id} não encontrado`,
      });
    }

    let passwordHash = current.password_hash;
    if (typeof dto.password === 'string' && dto.password.trim()) {
      passwordHash = await bcrypt.hash(dto.password.trim(), 10);
    }

    const result = await db.query(
      `
      UPDATE users
      SET
        name = $1,
        email = $2,
        password_hash = $3,
        role = $4,
        cpf = $5,
        phone = $6,
        photo_url = $7,
        department = $8,
        job_title = $9,
        position = $10,
        is_active = $11,
        notes = $12,
        updated_at = NOW()
      WHERE id = $13
      RETURNING
        id,
        account_id,
        name,
        email,
        role,
        cpf,
        phone,
        photo_url,
        department,
        job_title,
        position,
        is_active,
        notes,
        created_at,
        updated_at
      `,
      [
        dto.name ?? current.name,
        dto.email ?? current.email,
        passwordHash,
        dto.role ?? current.role,
        dto.cpf !== undefined ? dto.cpf : current.cpf,
        dto.phone !== undefined ? dto.phone : current.phone,
        dto.photoUrl !== undefined ? dto.photoUrl : current.photo_url,
        dto.department !== undefined ? dto.department : current.department,
        dto.jobTitle !== undefined ? dto.jobTitle : current.job_title,
        dto.position !== undefined ? dto.position : current.position,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        dto.notes !== undefined ? dto.notes : current.notes,
        id,
      ],
    );

    return res.json(normalizeUser(result.rows[0]));
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'E-mail já está em uso por outro usuário',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar usuário.',
      error: error.message,
    });
  }
}

async function patch(req: AuthenticatedRequest, res: Response) {
  return update(req, res);
}

async function remove(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    await db.query(
      `
      DELETE FROM users
      WHERE id = $1
      `,
      [id],
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover usuário.',
      error: error.message,
    });
  }
}

async function getMemberships(req: AuthenticatedRequest, res: Response) {
  try {
    const q: any = req.query ?? {};
    const accountId = req.user?.accountId;
    const userId = q.userId ? String(q.userId) : null;
    const processId = q.processId ? String(q.processId) : null;

    const conditions = ['account_id = $1'];
    const params: any[] = [accountId];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (processId) {
      params.push(processId);
      conditions.push(`process_id = $${params.length}`);
    }

    const result = await db.query(
      `
      SELECT
        id,
        user_id,
        account_id,
        process_id,
        role,
        is_active,
        created_at,
        updated_at
      FROM user_process_memberships
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      `,
      params,
    );

    return res.json(result.rows.map(normalizeMembership));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar memberships.',
      error: error.message,
    });
  }
}

async function getMembershipsAlt(req: AuthenticatedRequest, res: Response) {
  return getMemberships(req, res);
}

async function createMembership(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body ?? {};
    const accountId = req.user?.accountId;

    const result = await db.query(
      `
      INSERT INTO user_process_memberships (
        user_id,
        account_id,
        process_id,
        role,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_id,
        account_id,
        process_id,
        role,
        is_active,
        created_at,
        updated_at
      `,
      [
        body.userId,
        accountId,
        body.processId,
        body.role ?? 'member',
        true,
      ],
    );

    return res.status(201).json(normalizeMembership(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar membership.',
      error: error.message,
    });
  }
}

async function getAccountMemberships(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;

    const result = await db.query(
      `
      SELECT
        id,
        user_id,
        account_id,
        process_id,
        role,
        is_active,
        created_at,
        updated_at
      FROM user_process_memberships
      WHERE account_id = $1
      ORDER BY created_at DESC
      `,
      [accountId],
    );

    return res.json(result.rows.map(normalizeMembership));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar memberships da conta.',
      error: error.message,
    });
  }
}

async function getAccountMembershipsAlt(req: AuthenticatedRequest, res: Response) {
  return getAccountMemberships(req, res);
}

export default {
  findAll,
  findOne,
  create,
  update,
  patch,
  remove,
  getMemberships,
  getMembershipsAlt,
  createMembership,
  getAccountMemberships,
  getAccountMembershipsAlt,
};
