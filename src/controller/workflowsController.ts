import { Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

const DEFAULT_PERMISSION_ENTRY = {
  userIds: [],
  groupIds: [],
  environmentIds: [],
  processIds: [],
  areaIds: [],
  disciplineIds: [],
  roleIds: [],
  unitIds: [],
};

const DEFAULT_PERMISSIONS = {
  visualization: { ...DEFAULT_PERMISSION_ENTRY },
  creation: { ...DEFAULT_PERMISSION_ENTRY },
};

function normalize(item: any) {
  if (!item) return item;

  return {
    ...item,
    id: String(item.id),
    accountId: item.account_id ?? item.accountId,
    processId: item.process_id ?? item.processId ?? null,
    processName: item.process_name ?? item.processName ?? null,
    environmentId: item.environment_id ?? item.environmentId ?? null,
    environmentName: item.environment_name ?? item.environmentName ?? null,
    documentTypeId: item.document_type_id ?? item.documentTypeId ?? null,
    documentTypeName: item.document_type_name ?? item.documentTypeName ?? null,
    bpmnXml: item.bpmn_xml ?? item.bpmnXml ?? '',
    stepsCount: item.steps_count ?? item.stepsCount ?? 0,
    scopeLevel: item.scope_level ?? item.scopeLevel ?? 'process',
    tenantId: item.tenant_id ?? item.tenantId ?? null,
    accountName: item.account_name ?? item.accountName ?? null,
    publishedAt: item.published_at ?? item.publishedAt ?? null,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
    permissions: item.permissions ?? DEFAULT_PERMISSIONS,
    elementConfigs: item.element_configs ?? item.elementConfigs ?? [],
    snapshots: item.snapshots ?? [],
  };
}

function isValidUuid(value?: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findAll(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const q: any = req.query ?? {};

    if (q.processId) {
      const result = await db.query(
        `
        SELECT *
        FROM workflows
        WHERE account_id = $1
          AND process_id = $2
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
        `,
        [accountId, String(q.processId)],
      );

      return res.json(result.rows[0] ? [normalize(result.rows[0])] : []);
    }

    const result = await db.query(
      `
      SELECT *
      FROM workflows
      WHERE account_id = $1
      ORDER BY updated_at DESC, created_at DESC
      `,
      [accountId],
    );

    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar workflows.',
      error: error.message,
    });
  }
}

async function findOne(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const accountId = req.user?.accountId;

    const result = await db.query(
      `
      SELECT *
      FROM workflows
      WHERE account_id = $1
        AND (id = $2 OR public_id = $2)
      LIMIT 1
      `,
      [accountId, id],
    );

    const item = result.rows[0];

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Workflow ${id} não encontrado`,
      });
    }

    return res.json(normalize(item));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar workflow.',
      error: error.message,
    });
  }
}

async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const dto: any = req.body ?? {};
    const accountId = req.user?.accountId;

    if (dto.processId) {
      const existing = await db.query(
        `
        SELECT id
        FROM workflows
        WHERE account_id = $1
          AND process_id = $2
        LIMIT 1
        `,
        [accountId, dto.processId],
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `O processo ${dto.processId} já possui um workflow vinculado.`,
        });
      }
    }

    const publicId = randomUUID();
    const scopeLevel =
      dto.scopeLevel ??
      (dto.processId ? 'process' : dto.environmentId ? 'environment' : 'account');

    const result = await db.query(
      `
      INSERT INTO workflows (
        public_id,
        account_id,
        process_id,
        process_name,
        environment_id,
        environment_name,
        name,
        description,
        version,
        status,
        document_type_id,
        document_type_name,
        bpmn_xml,
        steps_count,
        permissions,
        element_configs,
        snapshots,
        scope_level,
        tenant_id,
        account_name,
        published_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb,
        $18, $19, $20, $21
      )
      RETURNING *
      `,
      [
        publicId,
        accountId,
        dto.processId ?? null,
        dto.processName ?? null,
        dto.environmentId ?? null,
        dto.environmentName ?? null,
        dto.name,
        dto.description ?? '',
        dto.version ?? '1.0',
        dto.status ?? 'draft',
        dto.documentTypeId ?? null,
        dto.documentTypeName ?? null,
        dto.bpmnXml ?? '',
        dto.stepsCount ?? 0,
        JSON.stringify(dto.permissions ?? DEFAULT_PERMISSIONS),
        JSON.stringify(dto.elementConfigs ?? []),
        JSON.stringify(dto.snapshots ?? []),
        scopeLevel,
        dto.tenantId ?? accountId,
        dto.accountName ?? null,
        dto.publishedAt ? dto.publishedAt : null,
      ],
    );

    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Já existe um workflow para este processo nesta conta.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar workflow.',
      error: error.message,
    });
  }
}

async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto: any = req.body ?? {};
    const accountId = req.user?.accountId;

    const currentResult = await db.query(
      `
      SELECT *
      FROM workflows
      WHERE account_id = $1
        AND (id = $2 OR public_id = $2)
      LIMIT 1
      `,
      [accountId, id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      return res.status(404).json({
        success: false,
        message: `Workflow ${id} não encontrado`,
      });
    }

    const nextProcessId =
      dto.processId !== undefined ? dto.processId : current.process_id;

    if (nextProcessId) {
      const existing = await db.query(
        `
        SELECT id, public_id
        FROM workflows
        WHERE account_id = $1
          AND process_id = $2
          AND id <> $3
        LIMIT 1
        `,
        [accountId, nextProcessId, current.id],
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `O processo ${nextProcessId} já possui um workflow vinculado.`,
        });
      }
    }

    const result = await db.query(
      `
      UPDATE workflows
      SET
        process_id = $1,
        process_name = $2,
        environment_id = $3,
        environment_name = $4,
        name = $5,
        description = $6,
        version = $7,
        status = $8,
        document_type_id = $9,
        document_type_name = $10,
        bpmn_xml = $11,
        steps_count = $12,
        permissions = $13::jsonb,
        element_configs = $14::jsonb,
        snapshots = $15::jsonb,
        scope_level = $16,
        tenant_id = $17,
        account_name = $18,
        published_at = $19,
        updated_at = NOW()
      WHERE id = $20
      RETURNING *
      `,
      [
        dto.processId !== undefined ? dto.processId : current.process_id,
        dto.processName !== undefined ? dto.processName : current.process_name,
        dto.environmentId !== undefined ? dto.environmentId : current.environment_id,
        dto.environmentName !== undefined ? dto.environmentName : current.environment_name,
        dto.name !== undefined ? dto.name : current.name,
        dto.description !== undefined ? dto.description : current.description,
        dto.version !== undefined ? dto.version : current.version,
        dto.status !== undefined ? dto.status : current.status,
        dto.documentTypeId !== undefined ? dto.documentTypeId : current.document_type_id,
        dto.documentTypeName !== undefined ? dto.documentTypeName : current.document_type_name,
        dto.bpmnXml !== undefined ? dto.bpmnXml : current.bpmn_xml,
        dto.stepsCount !== undefined ? dto.stepsCount : current.steps_count,
        JSON.stringify(dto.permissions ?? current.permissions ?? DEFAULT_PERMISSIONS),
        JSON.stringify(dto.elementConfigs ?? current.element_configs ?? []),
        JSON.stringify(dto.snapshots ?? current.snapshots ?? []),
        dto.scopeLevel !== undefined ? dto.scopeLevel : current.scope_level,
        dto.tenantId !== undefined ? dto.tenantId : current.tenant_id,
        dto.accountName !== undefined ? dto.accountName : current.account_name,
        dto.publishedAt !== undefined ? (dto.publishedAt ? dto.publishedAt : null) : current.published_at,
        current.id,
      ],
    );

    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Já existe um workflow para este processo nesta conta.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar workflow.',
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
    const accountId = req.user?.accountId;

    const result = await db.query(
      `
      DELETE FROM workflows
      WHERE account_id = $1
        AND (id = $2 OR public_id = $2)
      RETURNING id
      `,
      [accountId, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Workflow ${id} não encontrado`,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover workflow.',
      error: error.message,
    });
  }
}

export default {
  findAll,
  findOne,
  create,
  update,
  patch,
  remove,
};
