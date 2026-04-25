import { Response } from 'express'
import pool from '../config/database'
import type { AuthenticatedRequest } from '../middleware/authMiddleware'

type ProcessRow = {
  id: string
  account_id: string
  name: string
  code: string
  description?: string | null
  workflow_id?: string | null
  parent_process_id?: string | null
  status?: string | null
  is_active?: boolean
  permissions?: unknown
  document_creation?: unknown
  document_visualization?: unknown
  created_at?: string
  updated_at?: string
}

type ResolveAccountIdResult =
  | {
    ok: true
    accountId: string
  }
  | {
    ok: false
    status: number
    body: {
      success: false
      message: string
    }
  }

function resolveAccountId(
  req: AuthenticatedRequest,
  requestedAccountId?: string,
): ResolveAccountIdResult {
  const userAccountId = req.user?.accountId

  if (!userAccountId) {
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        message: 'Usuário não autenticado.',
      },
    }
  }

  if (requestedAccountId && requestedAccountId !== userAccountId) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        message: 'Você não tem permissão para acessar outra organização.',
      },
    }
  }

  return {
    ok: true,
    accountId: userAccountId,
  }
}

function normalizePermissions(value: unknown) {
  if (value && typeof value === 'object') {
    const obj = value as { userIds?: string[]; groupIds?: string[] }
    return {
      userIds: Array.isArray(obj.userIds) ? obj.userIds : [],
      groupIds: Array.isArray(obj.groupIds) ? obj.groupIds : [],
    }
  }

  return {
    userIds: [],
    groupIds: [],
  }
}

function normalizeProcess(row: ProcessRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    code: row.code,
    description: row.description ?? undefined,
    workflowId: row.workflow_id ?? null,
    parentProcessId: row.parent_process_id ?? null,
    status: row.status ?? 'active',
    isActive: row.is_active ?? true,
    permissions: normalizePermissions(row.permissions),
    documentCreation: normalizePermissions(row.document_creation),
    documentVisualization: normalizePermissions(row.document_visualization),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }
}

const processesController = {
  async findAll(req: AuthenticatedRequest, res: Response) {
    try {
      console.log('[PROCESSES][FIND_ALL] req.query =>', req.query)
      console.log('[PROCESSES][FIND_ALL] req.user =>', req.user)

      const { accountId } = req.query as { accountId?: string }
      const resolved = resolveAccountId(req, accountId)

      console.log('[PROCESSES][FIND_ALL] resolved =>', resolved)

      if (!resolved.ok) {
        return res.status(resolved.status).json(resolved.body)
      }

      const result = await pool.query(
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
      ORDER BY name ASC
      `,
        [resolved.accountId],
      )

      console.log('[PROCESSES][FIND_ALL] total rows =>', result.rows.length)
      console.log('[PROCESSES][FIND_ALL] first row =>', result.rows[0])

      return res.status(200).json(
        result.rows.map((row) => normalizeProcess(row as ProcessRow)),
      )
    } catch (error) {
      console.error('[PROCESSES][FIND_ALL] error =>', error)
      return res.status(500).json({ message: 'Erro ao buscar processos.' })
    }
  },

  async findOne(req: AuthenticatedRequest, res: Response) {
    try {
      const resolved = resolveAccountId(req)

      if (!resolved.ok) {
        return res.status(resolved.status).json(resolved.body)
      }

      const { id } = req.params

      const result = await pool.query(
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
          AND account_id = $2
        LIMIT 1
        `,
        [id, resolved.accountId],
      )

      const process = result.rows[0] as ProcessRow | undefined

      if (!process) {
        return res.status(404).json({ message: 'Processo não encontrado.' })
      }

      return res.status(200).json(normalizeProcess(process))
    } catch (error) {
      console.error('[PROCESSES][FIND_ONE] error =>', error)
      return res.status(500).json({ message: 'Erro ao buscar processo.' })
    }
  },

  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        name,
        code,
        description,
        accountId,
        workflowId,
        parentProcessId,
        status,
        isActive,
        permissions,
        documentCreation,
        documentVisualization,
      } = req.body as {
        name?: string
        code?: string
        description?: string
        accountId?: string
        workflowId?: string | null
        parentProcessId?: string | null
        status?: string
        isActive?: boolean
        permissions?: { userIds: string[]; groupIds: string[] }
        documentCreation?: { userIds: string[]; groupIds: string[] }
        documentVisualization?: { userIds: string[]; groupIds: string[] }
      }

      const resolved = resolveAccountId(req, accountId)

      if (!resolved.ok) {
        return res.status(resolved.status).json(resolved.body)
      }

      if (!name || !code) {
        return res.status(400).json({
          message: 'name e code são obrigatórios.',
        })
      }

      const duplicateResult = await pool.query(
        `
        SELECT id
        FROM processes
        WHERE account_id = $1
          AND code = $2
        LIMIT 1
        `,
        [resolved.accountId, code],
      )

      if (duplicateResult.rows.length > 0) {
        return res.status(409).json({
          message: 'Já existe um processo com este código nesta organização.',
        })
      }

      if (parentProcessId) {
        const parentResult = await pool.query(
          `
          SELECT id
          FROM processes
          WHERE id = $1
            AND account_id = $2
          LIMIT 1
          `,
          [parentProcessId, resolved.accountId],
        )

        if (parentResult.rows.length === 0) {
          return res.status(400).json({
            message: 'O processo pai informado não pertence à organização do usuário.',
          })
        }
      }

      const result = await pool.query(
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
          document_visualization,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9::jsonb, $10::jsonb, $11::jsonb,
          NOW(), NOW()
        )
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
          resolved.accountId,
          name,
          code,
          description ?? null,
          workflowId ?? null,
          parentProcessId ?? null,
          status ?? 'active',
          typeof isActive === 'boolean' ? isActive : true,
          JSON.stringify(permissions ?? { userIds: [], groupIds: [] }),
          JSON.stringify(documentCreation ?? { userIds: [], groupIds: [] }),
          JSON.stringify(documentVisualization ?? { userIds: [], groupIds: [] }),
        ],
      )

      return res.status(201).json(normalizeProcess(result.rows[0] as ProcessRow))
    } catch (error) {
      console.error('[PROCESSES][CREATE] error =>', error)
      return res.status(500).json({ message: 'Erro ao criar processo.' })
    }
  },

  async patch(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params
      const payload = req.body as {
        name?: string
        code?: string
        description?: string
        accountId?: string
        workflowId?: string | null
        parentProcessId?: string | null
        status?: string
        isActive?: boolean
        permissions?: { userIds: string[]; groupIds: string[] }
        documentCreation?: { userIds: string[]; groupIds: string[] }
        documentVisualization?: { userIds: string[]; groupIds: string[] }
      }

      const resolved = resolveAccountId(req, payload.accountId)

      if (!resolved.ok) {
        return res.status(resolved.status).json(resolved.body)
      }

      const current = await pool.query(
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
          AND account_id = $2
        LIMIT 1
        `,
        [id, resolved.accountId],
      )

      const process = current.rows[0] as ProcessRow | undefined

      if (!process) {
        return res.status(404).json({ message: 'Processo não encontrado.' })
      }

      const nextCode = payload.code ?? process.code

      if (nextCode !== process.code) {
        const duplicateResult = await pool.query(
          `
          SELECT id
          FROM processes
          WHERE account_id = $1
            AND code = $2
            AND id <> $3
          LIMIT 1
          `,
          [resolved.accountId, nextCode, id],
        )

        if (duplicateResult.rows.length > 0) {
          return res.status(409).json({
            message: 'Já existe outro processo com este código nesta organização.',
          })
        }
      }

      const nextParentProcessId =
        payload.parentProcessId !== undefined
          ? payload.parentProcessId
          : process.parent_process_id ?? null

      if (nextParentProcessId) {
        if (nextParentProcessId === id) {
          return res.status(400).json({
            message: 'Um processo não pode ser pai dele mesmo.',
          })
        }

        const parentResult = await pool.query(
          `
          SELECT id
          FROM processes
          WHERE id = $1
            AND account_id = $2
          LIMIT 1
          `,
          [nextParentProcessId, resolved.accountId],
        )

        if (parentResult.rows.length === 0) {
          return res.status(400).json({
            message: 'O processo pai informado não pertence à organização do usuário.',
          })
        }
      }

      const result = await pool.query(
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
          AND account_id = $12
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
          payload.name ?? process.name,
          nextCode,
          payload.description ?? process.description ?? null,
          payload.workflowId ?? process.workflow_id ?? null,
          nextParentProcessId,
          payload.status ?? process.status ?? 'active',
          typeof payload.isActive === 'boolean' ? payload.isActive : (process.is_active ?? true),
          JSON.stringify(payload.permissions ?? process.permissions ?? { userIds: [], groupIds: [] }),
          JSON.stringify(payload.documentCreation ?? process.document_creation ?? { userIds: [], groupIds: [] }),
          JSON.stringify(payload.documentVisualization ?? process.document_visualization ?? { userIds: [], groupIds: [] }),
          id,
          resolved.accountId,
        ],
      )

      return res.status(200).json(normalizeProcess(result.rows[0] as ProcessRow))
    } catch (error) {
      console.error('[PROCESSES][PATCH] error =>', error)
      return res.status(500).json({ message: 'Erro ao atualizar processo.' })
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    return processesController.patch(req, res)
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    try {
      const resolved = resolveAccountId(req)

      if (!resolved.ok) {
        return res.status(resolved.status).json(resolved.body)
      }

      const { id } = req.params

      const result = await pool.query(
        `
        DELETE FROM processes
        WHERE id = $1
          AND account_id = $2
        RETURNING id
        `,
        [id, resolved.accountId],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Processo não encontrado.' })
      }

      return res.status(200).json({ message: 'Processo removido com sucesso.' })
    } catch (error) {
      console.error('[PROCESSES][REMOVE] error =>', error)
      return res.status(500).json({ message: 'Erro ao remover processo.' })
    }
  },
}

export default processesController