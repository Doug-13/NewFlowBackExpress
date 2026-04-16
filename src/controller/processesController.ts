import { Response } from 'express';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

function normalize(item: any) {
  if (!item) return item;

  return {
    ...item,
    accountId: item.account_id ?? item.accountId,
    workflowId: item.workflow_id ?? item.workflowId ?? null,
    parentProcessId: item.parent_process_id ?? item.parentProcessId ?? null,
    isActive: item.is_active ?? item.isActive ?? true,
    documentCreation: item.document_creation ?? item.documentCreation ?? { userIds: [], groupIds: [] },
    documentVisualization: item.document_visualization ?? item.documentVisualization ?? { userIds: [], groupIds: [] },
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
  };
}

function isValidUuid(value?: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function invalidIdResponse(id: string, res: Response) {
  return res.status(400).json({
    success: false,
    message: `ID de processo inválido: "${id}"`,
  });
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
        code,
        description,
        workflow_id,
        parent_process_id,
        status,
        is_active,
        permissions,
        document_creation,
        document_visualization,
        created_at,
        updated_at
      FROM processes
      WHERE account_id = $1
      ORDER BY created_at DESC
      `,
      [accountId],
    );

    return res.json(result.rows.map(normalize));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar processos.',
      error: error.message,
    });
  }
}

async function findOne(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return invalidIdResponse(id, res);
    }

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        name,
        code,
        description,
        workflow_id,
        parent_process_id,
        status,
        is_active,
        permissions,
        document_creation,
        document_visualization,
        created_at,
        updated_at
      FROM processes
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const item = result.rows[0];

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Processo ${id} não encontrado`,
      });
    }

    return res.json(normalize(item));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar processo.',
      error: error.message,
    });
  }
}

async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const dto = req.body ?? {};
    const accountId = req.user?.accountId;

    const result = await db.query(
      `
      INSERT INTO processes (
        account_id,
        name,
        code,
        description,
        workflow_id,
        parent_process_id,
        status,
        is_active,
        permissions,
        document_creation,
        document_visualization
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
      RETURNING
        id,
        account_id,
        name,
        code,
        description,
        workflow_id,
        parent_process_id,
        status,
        is_active,
        permissions,
        document_creation,
        document_visualization,
        created_at,
        updated_at
      `,
      [
        accountId,
        dto.name,
        dto.code ?? null,
        dto.description ?? null,
        dto.workflowId ?? null,
        dto.parentProcessId ?? null,
        dto.status ?? 'active',
        dto.isActive ?? true,
        json_stringify(dto.permissions, {"userIds": [], "groupIds": []}),
        json_stringify(dto.documentCreation, {"userIds": [], "groupIds": []}),
        json_stringify(dto.documentVisualization, {"userIds": [], "groupIds": []}),
      ],
    );

    return res.status(201).json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar processo.',
      error: error.message,
    });
  }
}

async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};

    if (!isValidUuid(id)) {
      return invalidIdResponse(id, res);
    }

    const currentResult = await db.query(
      `
      SELECT *
      FROM processes
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      return res.status(404).json({
        success: false,
        message: `Processo ${id} não encontrado`,
      });
    }

    const result = await db.query(
      `
      UPDATE processes
      SET
        name = $1,
        code = $2,
        description = $3,
        workflow_id = $4,
        parent_process_id = $5,
        status = $6,
        is_active = $7,
        permissions = $8::jsonb,
        document_creation = $9::jsonb,
        document_visualization = $10::jsonb,
        updated_at = NOW()
      WHERE id = $11
      RETURNING
        id,
        account_id,
        name,
        code,
        description,
        workflow_id,
        parent_process_id,
        status,
        is_active,
        permissions,
        document_creation,
        document_visualization,
        created_at,
        updated_at
      `,
      [
        dto.name ?? current.name,
        dto.code !== undefined ? dto.code : current.code,
        dto.description !== undefined ? dto.description : current.description,
        dto.workflowId !== undefined ? dto.workflowId : current.workflow_id,
        dto.parentProcessId !== undefined ? dto.parentProcessId : current.parent_process_id,
        dto.status !== undefined ? dto.status : current.status,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        json_stringify(dto.permissions, current.permissions ?? {"userIds": [], "groupIds": []}),
        json_stringify(dto.documentCreation, current.document_creation ?? {"userIds": [], "groupIds": []}),
        json_stringify(dto.documentVisualization, current.document_visualization ?? {"userIds": [], "groupIds": []}),
        id,
      ],
    );

    return res.json(normalize(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar processo.',
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

    if (!isValidUuid(id)) {
      return invalidIdResponse(id, res);
    }

    await db.query(
      `
      DELETE FROM processes
      WHERE id = $1
      `,
      [id],
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover processo.',
      error: error.message,
    });
  }
}

function json_stringify(value: any, fallback: any) {
  return JSON.stringify(value ?? fallback);
}

export default {
  findAll,
  findOne,
  create,
  update,
  patch,
  remove,
};
