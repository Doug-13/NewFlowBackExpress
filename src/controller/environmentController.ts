import { Response } from 'express';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

async function get(req: AuthenticatedRequest, res: Response) {
  try {
    // Garante que só acessa as próprias configurações
    const accountId = req.user?.accountId;

    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
      });
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
      [accountId],
    );

    return res.json(result.rows[0] ?? null);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter configurações do ambiente.',
      error: error.message,
    });
  }
}

async function save(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId;
    const body = req.body ?? {};

    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
      });
    }

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
        accountId,
        JSON.stringify(body.revision ?? {}),
        JSON.stringify(body.creationMode ?? {}),
        JSON.stringify(body.codingRule ?? {}),
        JSON.stringify(body.sequential ?? {}),
        JSON.stringify(body.deadlines ?? {}),
      ],
    );

    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar configurações do ambiente.',
      error: error.message,
    });
  }
}

async function update(req: AuthenticatedRequest, res: Response) {
  return save(req, res);
}

async function getAlt(req: AuthenticatedRequest, res: Response) {
  return get(req, res);
}

async function saveAlt(req: AuthenticatedRequest, res: Response) {
  return save(req, res);
}

export default {
  get,
  save,
  update,
  getAlt,
  saveAlt,
};
