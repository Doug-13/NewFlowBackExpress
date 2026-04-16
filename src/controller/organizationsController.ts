import { Response } from 'express';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

function normalize(item: any) {
  if (!item) return item;

  return {
    ...item,
    accountId: item.account_id ?? item.accountId,
    unitId: item.unit_id ?? item.unitId ?? null,
    memberIds: item.member_ids ?? item.memberIds ?? [],
    memberNames: item.member_names ?? item.memberNames ?? [],
    isActive: item.is_active ?? item.isActive ?? true,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
  };
}

async function getUnits(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const result = await db.query(
      `SELECT id, account_id, name, code, description, type, unit_id, is_active, created_at, updated_at
       FROM organization_areas
       WHERE account_id = $1 AND type = 'unit'
       ORDER BY name ASC`,
      [accountId],
    );
    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar unidades.', error: error.message });
  }
}

async function createUnit(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const result = await db.query(
      `INSERT INTO organization_areas (account_id, name, code, description, type, unit_id, is_active)
       VALUES ($1, $2, $3, $4, 'unit', $5, $6)
       RETURNING id, account_id, name, code, description, type, unit_id, is_active, created_at, updated_at`,
      [accountId, dto.name, dto.code ?? null, dto.description ?? null, dto.unitId ?? null, dto.isActive ?? true],
    );
    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao criar unidade.', error: error.message });
  }
}

async function updateUnit(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const currentResult = await db.query(
      `SELECT * FROM organization_areas WHERE id = $1 AND account_id = $2 AND type = 'unit' LIMIT 1`,
      [id, accountId],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ success: false, message: `Unidade ${id} não encontrada` });

    const result = await db.query(
      `UPDATE organization_areas
       SET name = $1, code = $2, description = $3, unit_id = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 AND account_id = $7 AND type = 'unit'
       RETURNING id, account_id, name, code, description, type, unit_id, is_active, created_at, updated_at`,
      [
        dto.name ?? current.name,
        dto.code !== undefined ? dto.code : current.code,
        dto.description !== undefined ? dto.description : current.description,
        dto.unitId !== undefined ? dto.unitId : current.unit_id,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        id,
        accountId,
      ],
    );
    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar unidade.', error: error.message });
  }
}

async function patchUnit(req: AuthenticatedRequest, res: Response) { return updateUnit(req, res); }

async function removeUnit(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const accountId = req.user?.accountId;
    await db.query(`DELETE FROM organization_areas WHERE id = $1 AND account_id = $2 AND type = 'unit'`, [id, accountId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover unidade.', error: error.message });
  }
}

async function getAreas(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const result = await db.query(
      `SELECT id, account_id, name, code, description, type, unit_id, is_active, created_at, updated_at
       FROM organization_areas
       WHERE account_id = $1 AND type <> 'unit'
       ORDER BY name ASC`,
      [accountId],
    );
    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar áreas.', error: error.message });
  }
}

async function createArea(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const result = await db.query(
      `INSERT INTO organization_areas (account_id, name, code, description, type, unit_id, is_active)
       VALUES ($1, $2, $3, $4, 'area', $5, $6)
       RETURNING id, account_id, name, code, description, type, unit_id, is_active, created_at, updated_at`,
      [accountId, dto.name, dto.code ?? null, dto.description ?? null, dto.unitId ?? null, dto.isActive ?? true],
    );
    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao criar área.', error: error.message });
  }
}

async function updateArea(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const currentResult = await db.query(
      `SELECT * FROM organization_areas WHERE id = $1 AND account_id = $2 AND type <> 'unit' LIMIT 1`,
      [id, accountId],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ success: false, message: `Área ${id} não encontrada` });

    const result = await db.query(
      `UPDATE organization_areas
       SET name = $1, code = $2, description = $3, unit_id = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 AND account_id = $7 AND type <> 'unit'
       RETURNING id, account_id, name, code, description, type, unit_id, is_active, created_at, updated_at`,
      [
        dto.name ?? current.name,
        dto.code !== undefined ? dto.code : current.code,
        dto.description !== undefined ? dto.description : current.description,
        dto.unitId !== undefined ? dto.unitId : current.unit_id,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        id,
        accountId,
      ],
    );
    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar área.', error: error.message });
  }
}

async function patchArea(req: AuthenticatedRequest, res: Response) { return updateArea(req, res); }

async function removeArea(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const accountId = req.user?.accountId;
    await db.query(`DELETE FROM organization_areas WHERE id = $1 AND account_id = $2 AND type <> 'unit'`, [id, accountId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover área.', error: error.message });
  }
}

async function getRoles(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const result = await db.query(
      `SELECT id, account_id, name, code, description, type, is_active, created_at, updated_at
       FROM organization_roles
       WHERE account_id = $1 AND type <> 'discipline'
       ORDER BY name ASC`,
      [accountId],
    );
    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar funções.', error: error.message });
  }
}

async function createRole(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const result = await db.query(
      `INSERT INTO organization_roles (account_id, name, code, description, type, is_active)
       VALUES ($1, $2, $3, $4, 'role', $5)
       RETURNING id, account_id, name, code, description, type, is_active, created_at, updated_at`,
      [accountId, dto.name, dto.code ?? null, dto.description ?? null, dto.isActive ?? true],
    );
    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao criar função.', error: error.message });
  }
}

async function updateRole(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const currentResult = await db.query(
      `SELECT * FROM organization_roles WHERE id = $1 AND account_id = $2 AND type <> 'discipline' LIMIT 1`,
      [id, accountId],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ success: false, message: `Função ${id} não encontrada` });

    const result = await db.query(
      `UPDATE organization_roles
       SET name = $1, code = $2, description = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND account_id = $6 AND type <> 'discipline'
       RETURNING id, account_id, name, code, description, type, is_active, created_at, updated_at`,
      [
        dto.name ?? current.name,
        dto.code !== undefined ? dto.code : current.code,
        dto.description !== undefined ? dto.description : current.description,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        id,
        accountId,
      ],
    );
    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar função.', error: error.message });
  }
}

async function patchRole(req: AuthenticatedRequest, res: Response) { return updateRole(req, res); }

async function removeRole(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const accountId = req.user?.accountId;
    await db.query(`DELETE FROM organization_roles WHERE id = $1 AND account_id = $2 AND type <> 'discipline'`, [id, accountId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover função.', error: error.message });
  }
}

async function getDisciplines(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const result = await db.query(
      `SELECT id, account_id, name, code, description, type, is_active, created_at, updated_at
       FROM organization_roles
       WHERE account_id = $1 AND type = 'discipline'
       ORDER BY name ASC`,
      [accountId],
    );
    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar disciplinas.', error: error.message });
  }
}

async function createDiscipline(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const result = await db.query(
      `INSERT INTO organization_roles (account_id, name, code, description, type, is_active)
       VALUES ($1, $2, $3, $4, 'discipline', $5)
       RETURNING id, account_id, name, code, description, type, is_active, created_at, updated_at`,
      [accountId, dto.name, dto.code ?? null, dto.description ?? null, dto.isActive ?? true],
    );
    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao criar disciplina.', error: error.message });
  }
}

async function updateDiscipline(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const currentResult = await db.query(
      `SELECT * FROM organization_roles WHERE id = $1 AND account_id = $2 AND type = 'discipline' LIMIT 1`,
      [id, accountId],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ success: false, message: `Disciplina ${id} não encontrada` });

    const result = await db.query(
      `UPDATE organization_roles
       SET name = $1, code = $2, description = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND account_id = $6 AND type = 'discipline'
       RETURNING id, account_id, name, code, description, type, is_active, created_at, updated_at`,
      [
        dto.name ?? current.name,
        dto.code !== undefined ? dto.code : current.code,
        dto.description !== undefined ? dto.description : current.description,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        id,
        accountId,
      ],
    );
    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar disciplina.', error: error.message });
  }
}

async function patchDiscipline(req: AuthenticatedRequest, res: Response) { return updateDiscipline(req, res); }

async function removeDiscipline(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const accountId = req.user?.accountId;
    await db.query(`DELETE FROM organization_roles WHERE id = $1 AND account_id = $2 AND type = 'discipline'`, [id, accountId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover disciplina.', error: error.message });
  }
}

async function getGroups(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const result = await db.query(
      `SELECT id, account_id, name, code, description, member_ids, member_names, is_active, created_at, updated_at
       FROM organization_groups
       WHERE account_id = $1
       ORDER BY name ASC`,
      [accountId],
    );
    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar grupos.', error: error.message });
  }
}

async function createGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const result = await db.query(
      `INSERT INTO organization_groups (account_id, name, code, description, member_ids, member_names, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING id, account_id, name, code, description, member_ids, member_names, is_active, created_at, updated_at`,
      [accountId, dto.name, dto.code ?? null, dto.description ?? null, JSON.stringify(dto.memberIds ?? []), JSON.stringify(dto.memberNames ?? []), dto.isActive ?? true],
    );
    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao criar grupo.', error: error.message });
  }
}

async function updateGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;
    const currentResult = await db.query(
      `SELECT * FROM organization_groups WHERE id = $1 AND account_id = $2 LIMIT 1`,
      [id, accountId],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ success: false, message: `Grupo ${id} não encontrado` });

    const result = await db.query(
      `UPDATE organization_groups
       SET name = $1, code = $2, description = $3, member_ids = $4::jsonb, member_names = $5::jsonb, is_active = $6, updated_at = NOW()
       WHERE id = $7 AND account_id = $8
       RETURNING id, account_id, name, code, description, member_ids, member_names, is_active, created_at, updated_at`,
      [
        dto.name ?? current.name,
        dto.code !== undefined ? dto.code : current.code,
        dto.description !== undefined ? dto.description : current.description,
        JSON.stringify(dto.memberIds ?? current.member_ids ?? []),
        JSON.stringify(dto.memberNames ?? current.member_names ?? []),
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        id,
        accountId,
      ],
    );
    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar grupo.', error: error.message });
  }
}

async function patchGroup(req: AuthenticatedRequest, res: Response) { return updateGroup(req, res); }

async function removeGroup(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const accountId = req.user?.accountId;
    await db.query(`DELETE FROM organization_groups WHERE id = $1 AND account_id = $2`, [id, accountId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover grupo.', error: error.message });
  }
}

export default {
  getUnits,
  createUnit,
  updateUnit,
  patchUnit,
  removeUnit,
  getAreas,
  createArea,
  updateArea,
  patchArea,
  removeArea,
  getRoles,
  createRole,
  updateRole,
  patchRole,
  removeRole,
  getDisciplines,
  createDiscipline,
  updateDiscipline,
  patchDiscipline,
  removeDiscipline,
  getGroups,
  createGroup,
  updateGroup,
  patchGroup,
  removeGroup,
};
