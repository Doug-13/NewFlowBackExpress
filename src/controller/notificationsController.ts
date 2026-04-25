  import { Request, Response } from 'express';
  import db from '../config/database';
  import { AuthenticatedRequest } from '../middleware/authMiddleware';

  function normalize(item: any) {
    if (!item) return item;

    return {
      ...item,
      accountId: item.account_id,
      isActive: item.is_active,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
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
          channel,
          subject,
          body,
          is_active,
          created_at,
          updated_at
        FROM notification_templates
        WHERE account_id = $1
        ORDER BY name ASC
        `,
        [accountId],
      );

      return res.json(result.rows.map(normalize));
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao listar templates de notificação.',
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
        SELECT
          id,
          account_id,
          name,
          code,
          description,
          channel,
          subject,
          body,
          is_active,
          created_at,
          updated_at
        FROM notification_templates
        WHERE id = $1
          AND account_id = $2
        LIMIT 1
        `,
        [id, accountId],
      );

      const item = result.rows[0];

      if (!item) {
        return res.status(404).json({
          success: false,
          message: `Template ${id} não encontrado`,
        });
      }

      return res.json(normalize(item));
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar template de notificação.',
        error: error.message,
      });
    }
  }

  async function create(req: AuthenticatedRequest, res: Response) {
    try {
      const accountId = req.user?.accountId;
      const dto = req.body ?? {};

      const existing = await db.query(
        `
        SELECT id
        FROM notification_templates
        WHERE account_id = $1
          AND code = $2
        LIMIT 1
        `,
        [accountId, dto.code],
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Código "${dto.code}" já existe nesta conta`,
        });
      }

      const result = await db.query(
        `
        INSERT INTO notification_templates (
          account_id,
          name,
          code,
          description,
          channel,
          subject,
          body,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          account_id,
          name,
          code,
          description,
          channel,
          subject,
          body,
          is_active,
          created_at,
          updated_at
        `,
        [
          accountId,
          dto.name,
          dto.code,
          dto.description ?? null,
          dto.channel,
          dto.subject ?? null,
          dto.body,
          dto.isActive ?? true,
        ],
      );

      return res.status(201).json(normalize(result.rows[0]));
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Código já existe',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro ao criar template de notificação.',
        error: error.message,
      });
    }
  }

  async function update(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const accountId = req.user?.accountId;
      const dto = req.body ?? {};

      const currentResult = await db.query(
        `
        SELECT
          id,
          account_id,
          name,
          code,
          description,
          channel,
          subject,
          body,
          is_active
        FROM notification_templates
        WHERE id = $1
          AND account_id = $2
        LIMIT 1
        `,
        [id, accountId],
      );

      const current = currentResult.rows[0];

      if (!current) {
        return res.status(404).json({
          success: false,
          message: `Template ${id} não encontrado`,
        });
      }

      const result = await db.query(
        `
        UPDATE notification_templates
        SET
          name = $1,
          code = $2,
          description = $3,
          channel = $4,
          subject = $5,
          body = $6,
          is_active = $7,
          updated_at = NOW()
        WHERE id = $8
          AND account_id = $9
        RETURNING
          id,
          account_id,
          name,
          code,
          description,
          channel,
          subject,
          body,
          is_active,
          created_at,
          updated_at
        `,
        [
          dto.name ?? current.name,
          dto.code ?? current.code,
          dto.description !== undefined ? dto.description : current.description,
          dto.channel ?? current.channel,
          dto.subject !== undefined ? dto.subject : current.subject,
          dto.body ?? current.body,
          dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
          id,
          accountId,
        ],
      );

      return res.json(normalize(result.rows[0]));
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Código já existe',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar template de notificação.',
        error: error.message,
      });
    }
  }

  async function remove(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const accountId = req.user?.accountId;

      await db.query(
        `
        DELETE FROM notification_templates
        WHERE id = $1
          AND account_id = $2
        `,
        [id, accountId],
      );

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao remover template de notificação.',
        error: error.message,
      });
    }
  }

  export default {
    findAll,
    findOne,
    create,
    update,
    remove,
  };
