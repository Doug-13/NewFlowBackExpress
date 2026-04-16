import { Request, Response } from 'express';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

function normalizeItem<T extends Record<string, any>>(item: T | undefined | null) {
  if (!item) return item;
  return {
    ...item,
    metadataSetName: item.metadata_set_name ?? item.metadataSetName ?? '',
    metadataSetId: item.metadata_set_id ?? item.metadataSetId ?? null,
    documentTypeId: item.document_type_id ?? item.documentTypeId ?? null,
    fieldType: item.field_type ?? item.fieldType ?? 'text',
    maskType: item.mask_type ?? item.maskType ?? null,
    isRequired: item.is_required ?? item.isRequired ?? false,
    isActive: item.is_active ?? item.isActive ?? true,
    orderIndex: item.order_index ?? item.orderIndex ?? 0,
    multipleSelection: item.multiple_selection ?? item.multipleSelection ?? false,
    tableColumns: item.table_columns ?? item.tableColumns ?? [],
    accountId: item.account_id ?? item.accountId ?? null,
    processId: item.process_id ?? item.processId ?? null,
    metadataDefinitionId: item.metadata_definition_id ?? item.metadataDefinitionId ?? null,
    documentInstanceId: item.document_instance_id ?? item.documentInstanceId ?? null,
    stepName: item.step_name ?? item.stepName ?? null,
    userName: item.user_name ?? item.userName ?? null,
    createdAt: item.created_at ?? item.createdAt,
    updatedAt: item.updated_at ?? item.updatedAt,
  };
}

// ── Valores por documento ──────────────────────────────────────────────────

async function getValues(req: Request, res: Response) {
  try {
    const { documentId } = req.params;

    const result = await db.query(
      `
      SELECT
        id,
        document_instance_id,
        metadata_definition_id,
        account_id,
        process_id,
        name,
        label,
        field_type,
        mask_type,
        is_required,
        value,
        options,
        table_columns,
        created_at,
        updated_at
      FROM metadata_values
      WHERE document_instance_id = $1
      ORDER BY label ASC, name ASC
      `,
      [documentId],
    );

    const data = result.rows.map((item: any) => ({
      metadataDefinitionId: item.metadata_definition_id,
      name: item.name ?? '',
      label: item.label ?? '',
      fieldType: item.field_type ?? 'text',
      maskType: item.mask_type ?? null,
      isRequired: Boolean(item.is_required),
      isReadOnly: false,
      value: item.value ?? null,
      options: item.options ?? [],
      tableColumns: item.table_columns ?? [],
    }));

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar metadados do documento.',
      error: error.message,
    });
  }
}

async function saveValues(req: AuthenticatedRequest, res: Response) {
  const client = await db.pool.connect();

  try {
    const { documentId } = req.params;
    const dto = req.body ?? {};
    const values = Array.isArray(dto.values) ? dto.values : [];

    const accountId = req.user?.accountId ?? '';
    const processId = req.body?.processId ?? '';
    const stepName = req.body?.stepName ?? '';
    const userName = req.user?.name ?? 'Usuário';

    await client.query('BEGIN');

    const definitionIds = values
      .map((item: any) => item.metadataDefinitionId)
      .filter((id: string | undefined) => typeof id === 'string' && id.trim().length > 0);

    let definitionMap = new Map<string, any>();

    if (definitionIds.length > 0) {
      const defsResult = await client.query(
        `
        SELECT
          id,
          name,
          label,
          field_type,
          mask_type,
          is_required,
          options,
          table_columns
        FROM metadata_definitions
        WHERE id = ANY($1::uuid[])
        `,
        [definitionIds],
      );

      definitionMap = new Map(defsResult.rows.map((item: any) => [item.id, item]));
    }

    for (const value of values) {
      const def = definitionMap.get(value.metadataDefinitionId);

      await client.query(
        `
        INSERT INTO metadata_values (
          document_instance_id,
          metadata_definition_id,
          account_id,
          process_id,
          name,
          label,
          field_type,
          mask_type,
          is_required,
          value,
          options,
          table_columns
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
        ON CONFLICT (document_instance_id, metadata_definition_id)
        DO UPDATE SET
          account_id = EXCLUDED.account_id,
          process_id = EXCLUDED.process_id,
          name = EXCLUDED.name,
          label = EXCLUDED.label,
          field_type = EXCLUDED.field_type,
          mask_type = EXCLUDED.mask_type,
          is_required = EXCLUDED.is_required,
          value = EXCLUDED.value,
          options = EXCLUDED.options,
          table_columns = EXCLUDED.table_columns,
          updated_at = NOW()
        `,
        [
          documentId,
          value.metadataDefinitionId,
          accountId,
          processId,
          value.name ?? def?.name ?? '',
          value.label ?? def?.label ?? '',
          value.fieldType ?? def?.field_type ?? 'text',
          value.maskType ?? def?.mask_type ?? null,
          Boolean(value.isRequired ?? def?.is_required ?? false),
          JSON.stringify(value.value ?? null),
          JSON.stringify(value.options ?? def?.options ?? []),
          JSON.stringify(value.tableColumns ?? def?.table_columns ?? []),
        ],
      );
    }

    await client.query(
      `
      INSERT INTO audit_logs (
        document_instance_id,
        action,
        step_name,
        user_name,
        comment
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [documentId, 'MetadataSaved', stepName || null, userName || null, null],
    );

    await client.query('COMMIT');

    return res.json({ success: true });
  } catch (error: any) {
    await client.query('ROLLBACK');

    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar metadados do documento.',
      error: error.message,
    });
  } finally {
    client.release();
  }
}

// ── Definições ─────────────────────────────────────────────────────────────

async function findDefs(req: AuthenticatedRequest, res: Response) {
  try {
    const q: any = req.query ?? {};
    const accountId = String(q.accountId ?? q.tenantId ?? req.user?.accountId ?? '');
    const metadataSetId = q.metadataSetId ? String(q.metadataSetId) : null;
    const documentTypeId = q.documentTypeId ? String(q.documentTypeId) : null;

    const conditions = [];
    const params: any[] = [];

    if (accountId) {
      params.push(accountId);
      conditions.push(`account_id = $${params.length}`);
    }

    if (metadataSetId) {
      params.push(metadataSetId);
      conditions.push(`metadata_set_id = $${params.length}`);
    }

    if (documentTypeId) {
      params.push(documentTypeId);
      conditions.push(`document_type_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        name,
        label,
        field_type,
        mask_type,
        is_required,
        is_active,
        order_index,
        metadata_set_id,
        metadata_set_name,
        document_type_id,
        multiple_selection,
        options,
        table_columns,
        created_at,
        updated_at
      FROM metadata_definitions
      ${whereClause}
      ORDER BY order_index ASC, label ASC
      `,
      params,
    );

    return res.json(result.rows.map((item: any) => normalizeItem(item)));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar definições de metadados.',
      error: error.message,
    });
  }
}

async function createDef(req: AuthenticatedRequest, res: Response) {
  try {
    const dto: any = req.body ?? {};
    const accountId = dto.accountId ?? req.user?.accountId ?? null;

    let metadataSetName = dto.metadataSetName ?? '';

    if (!metadataSetName && dto.metadataSetId) {
      const setResult = await db.query(
        `
        SELECT name
        FROM metadata_sets
        WHERE id = $1
        LIMIT 1
        `,
        [dto.metadataSetId],
      );

      metadataSetName = setResult.rows[0]?.name ?? '';
    }

    const result = await db.query(
      `
      INSERT INTO metadata_definitions (
        account_id,
        name,
        label,
        field_type,
        mask_type,
        is_required,
        is_active,
        order_index,
        metadata_set_id,
        metadata_set_name,
        document_type_id,
        multiple_selection,
        options,
        table_columns
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
      RETURNING
        id,
        account_id,
        name,
        label,
        field_type,
        mask_type,
        is_required,
        is_active,
        order_index,
        metadata_set_id,
        metadata_set_name,
        document_type_id,
        multiple_selection,
        options,
        table_columns,
        created_at,
        updated_at
      `,
      [
        accountId,
        dto.name,
        dto.label,
        dto.fieldType,
        dto.maskType ?? null,
        dto.isRequired ?? false,
        dto.isActive ?? true,
        dto.orderIndex ?? 1,
        dto.metadataSetId ?? null,
        metadataSetName,
        dto.documentTypeId ?? null,
        dto.multipleSelection ?? false,
        JSON.stringify(dto.options ?? []),
        JSON.stringify(dto.tableColumns ?? []),
      ],
    );

    return res.status(201).json(normalizeItem(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar definição de metadado.',
      error: error.message,
    });
  }
}

async function updateDef(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto: any = req.body ?? {};

    const currentResult = await db.query(
      `
      SELECT *
      FROM metadata_definitions
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      return res.status(404).json({
        success: false,
        message: `Definição ${id} não encontrada`,
      });
    }

    let metadataSetName = dto.metadataSetName;

    if (dto.metadataSetId) {
      const setResult = await db.query(
        `
        SELECT name
        FROM metadata_sets
        WHERE id = $1
        LIMIT 1
        `,
        [dto.metadataSetId],
      );

      metadataSetName = setResult.rows[0]?.name ?? '';
    }

    const result = await db.query(
      `
      UPDATE metadata_definitions
      SET
        account_id = $1,
        name = $2,
        label = $3,
        field_type = $4,
        mask_type = $5,
        is_required = $6,
        is_active = $7,
        order_index = $8,
        metadata_set_id = $9,
        metadata_set_name = $10,
        document_type_id = $11,
        multiple_selection = $12,
        options = $13::jsonb,
        table_columns = $14::jsonb,
        updated_at = NOW()
      WHERE id = $15
      RETURNING
        id,
        account_id,
        name,
        label,
        field_type,
        mask_type,
        is_required,
        is_active,
        order_index,
        metadata_set_id,
        metadata_set_name,
        document_type_id,
        multiple_selection,
        options,
        table_columns,
        created_at,
        updated_at
      `,
      [
        dto.accountId ?? req.user?.accountId ?? current.account_id,
        dto.name ?? current.name,
        dto.label ?? current.label,
        dto.fieldType ?? current.field_type,
        dto.maskType !== undefined ? dto.maskType : current.mask_type,
        dto.isRequired !== undefined ? Boolean(dto.isRequired) : current.is_required,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        dto.orderIndex !== undefined ? Number(dto.orderIndex) : current.order_index,
        dto.metadataSetId !== undefined ? dto.metadataSetId : current.metadata_set_id,
        metadataSetName !== undefined ? metadataSetName : current.metadata_set_name,
        dto.documentTypeId !== undefined ? dto.documentTypeId : current.document_type_id,
        dto.multipleSelection !== undefined ? Boolean(dto.multipleSelection) : current.multiple_selection,
        JSON.stringify(dto.options ?? current.options ?? []),
        JSON.stringify(dto.tableColumns ?? current.table_columns ?? []),
        id,
      ],
    );

    return res.json(normalizeItem(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar definição de metadado.',
      error: error.message,
    });
  }
}

async function patchDef(req: AuthenticatedRequest, res: Response) {
  return updateDef(req, res);
}

async function removeDef(req: Request, res: Response) {
  try {
    const { id } = req.params;

    await db.query(
      `
      DELETE FROM metadata_definitions
      WHERE id = $1
      `,
      [id],
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover definição de metadado.',
      error: error.message,
    });
  }
}

// ── Conjuntos ──────────────────────────────────────────────────────────────

async function findSets(req: AuthenticatedRequest, res: Response) {
  try {
    const q: any = req.query ?? {};
    const accountId = q.accountId ?? q.tenantId ?? req.user?.accountId;

    const result = accountId
      ? await db.query(
          `
          SELECT
            id,
            account_id,
            name,
            code,
            description,
            is_active,
            order_index,
            created_at,
            updated_at
          FROM metadata_sets
          WHERE account_id = $1
          ORDER BY order_index ASC, name ASC
          `,
          [accountId],
        )
      : await db.query(
          `
          SELECT
            id,
            account_id,
            name,
            code,
            description,
            is_active,
            order_index,
            created_at,
            updated_at
          FROM metadata_sets
          ORDER BY order_index ASC, name ASC
          `,
        );

    return res.json(result.rows.map((item: any) => normalizeItem(item)));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar conjuntos de metadados.',
      error: error.message,
    });
  }
}

async function createSet(req: AuthenticatedRequest, res: Response) {
  try {
    const dto: any = req.body ?? {};

    const result = await db.query(
      `
      INSERT INTO metadata_sets (
        account_id,
        name,
        code,
        description,
        is_active,
        order_index
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        account_id,
        name,
        code,
        description,
        is_active,
        order_index,
        created_at,
        updated_at
      `,
      [
        dto.accountId ?? req.user?.accountId ?? null,
        dto.name,
        dto.code,
        dto.description ?? null,
        dto.isActive ?? true,
        dto.orderIndex ?? 0,
      ],
    );

    return res.status(201).json(normalizeItem(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar conjunto de metadados.',
      error: error.message,
    });
  }
}

async function updateSet(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto: any = req.body ?? {};

    const currentResult = await db.query(
      `
      SELECT *
      FROM metadata_sets
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const current = currentResult.rows[0];

    if (!current) {
      return res.status(404).json({
        success: false,
        message: `Conjunto ${id} não encontrado`,
      });
    }

    const result = await db.query(
      `
      UPDATE metadata_sets
      SET
        account_id = $1,
        name = $2,
        code = $3,
        description = $4,
        is_active = $5,
        order_index = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING
        id,
        account_id,
        name,
        code,
        description,
        is_active,
        order_index,
        created_at,
        updated_at
      `,
      [
        dto.accountId ?? req.user?.accountId ?? current.account_id,
        dto.name ?? current.name,
        dto.code ?? current.code,
        dto.description !== undefined ? dto.description : current.description,
        dto.isActive !== undefined ? Boolean(dto.isActive) : current.is_active,
        dto.orderIndex !== undefined ? Number(dto.orderIndex) : current.order_index,
        id,
      ],
    );

    return res.json(normalizeItem(result.rows[0]));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar conjunto de metadados.',
      error: error.message,
    });
  }
}

async function patchSet(req: AuthenticatedRequest, res: Response) {
  return updateSet(req, res);
}

async function removeSet(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const linked = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM metadata_definitions
      WHERE metadata_set_id = $1
      `,
      [id],
    );

    const total = linked.rows[0]?.total ?? 0;

    if (total > 0) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível remover o conjunto porque existem metadados vinculados a ele.',
      });
    }

    await db.query(
      `
      DELETE FROM metadata_sets
      WHERE id = $1
      `,
      [id],
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover conjunto de metadados.',
      error: error.message,
    });
  }
}

export default {
  getValues,
  saveValues,
  findDefs,
  createDef,
  updateDef,
  patchDef,
  removeDef,
  findSets,
  createSet,
  updateSet,
  patchSet,
  removeSet,
};
