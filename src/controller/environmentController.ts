import { Response } from 'express'
import db from '../config/database'
import { AuthenticatedRequest } from '../middleware/authMiddleware'

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

function resolveAccountId(req: AuthenticatedRequest): ResolveAccountIdResult {
  const routeAccountId = req.params.accountId
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

  if (routeAccountId && routeAccountId !== userAccountId) {
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
    accountId: routeAccountId || userAccountId,
  }
}

async function get(req: AuthenticatedRequest, res: Response) {
  try {
    const resolved = resolveAccountId(req)

    if (!resolved.ok) {
      return res.status(resolved.status).json(resolved.body)
    }

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        revision,
        creation_mode,
        coding_rule,
        sequential,
        deadlines,
        created_at,
        updated_at
      FROM environment_settings
      WHERE account_id = $1
      LIMIT 1
      `,
      [resolved.accountId],
    )

    const row = result.rows[0]

    if (!row) {
      return res.json(null)
    }

    return res.json({
      id: row.id,
      accountId: row.account_id,
      revision: row.revision ?? {},
      creationMode: row.creation_mode ?? {},
      codingRule: row.coding_rule ?? {},
      sequential: row.sequential ?? {},
      deadlines: row.deadlines ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  } catch (error: any) {
    console.error('[ENVIRONMENT][GET] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao obter configurações do ambiente.',
      error: error.message,
    })
  }
}

async function save(req: AuthenticatedRequest, res: Response) {
  try {
    const resolved = resolveAccountId(req)

    if (!resolved.ok) {
      return res.status(resolved.status).json(resolved.body)
    }

    const body = req.body ?? {}

    const result = await db.query(
      `
      INSERT INTO environment_settings (
        account_id,
        revision,
        creation_mode,
        coding_rule,
        sequential,
        deadlines
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)
      ON CONFLICT (account_id)
      DO UPDATE SET
        revision = EXCLUDED.revision,
        creation_mode = EXCLUDED.creation_mode,
        coding_rule = EXCLUDED.coding_rule,
        sequential = EXCLUDED.sequential,
        deadlines = EXCLUDED.deadlines,
        updated_at = NOW()
      RETURNING
        id,
        account_id,
        revision,
        creation_mode,
        coding_rule,
        sequential,
        deadlines,
        created_at,
        updated_at
      `,
      [
        resolved.accountId,
        JSON.stringify(body.revision ?? {}),
        JSON.stringify(body.creationMode ?? {}),
        JSON.stringify(body.codingRule ?? {}),
        JSON.stringify(body.sequential ?? {}),
        JSON.stringify(body.deadlines ?? {}),
      ],
    )

    const row = result.rows[0]

    return res.json({
      id: row.id,
      accountId: row.account_id,
      revision: row.revision ?? {},
      creationMode: row.creation_mode ?? {},
      codingRule: row.coding_rule ?? {},
      sequential: row.sequential ?? {},
      deadlines: row.deadlines ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  } catch (error: any) {
    console.error('[ENVIRONMENT][SAVE] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar configurações do ambiente.',
      error: error.message,
    })
  }
}

async function update(req: AuthenticatedRequest, res: Response) {
  return save(req, res)
}

async function getAlt(req: AuthenticatedRequest, res: Response) {
  return get(req, res)
}

async function saveAlt(req: AuthenticatedRequest, res: Response) {
  return save(req, res)
}

export default {
  get,
  save,
  update,
  getAlt,
  saveAlt,
}