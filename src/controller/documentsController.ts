import { Request, Response } from 'express';
import db from '../config/database';

type DocumentFilters = {
  accountId?: string;
  processId?: string;
  status?: string;
  createdById?: string;
};

function buildFindAllWhere(filters: DocumentFilters) {
  const conditions: string[] = [];
  const values: any[] = [];

  if (filters.accountId) {
    values.push(filters.accountId);
    conditions.push(`account_id = $${values.length}`);
  }

  if (filters.processId) {
    values.push(filters.processId);
    conditions.push(`process_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  if (filters.createdById) {
    values.push(filters.createdById);
    conditions.push(`created_by_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
}

async function enrichDocument(documentId: string, doc: any) {
  const [tasksResult, auditLogsResult, metadataValuesResult] = await Promise.all([
    db.query(
      `
      SELECT
        id,
        document_instance_id,
        step_order_index,
        step_name,
        element_id,
        assigned_user_id,
        assigned_user_name,
        status,
        action_taken,
        comment,
        due_date,
        completed_at,
        allowed_actions,
        task_actions,
        created_at,
        updated_at
      FROM tasks
      WHERE document_instance_id = $1
      ORDER BY created_at DESC
      `,
      [documentId],
    ),
    db.query(
      `
      SELECT
        id,
        document_instance_id,
        action,
        step_name,
        user_name,
        comment,
        metadata,
        created_at,
        updated_at
      FROM audit_logs
      WHERE document_instance_id = $1
      ORDER BY created_at DESC
      `,
      [documentId],
    ),
    db.query(
      `
      SELECT
        id,
        document_instance_id,
        metadata_definition_id,
        account_id,
        process_id,
        value,
        created_at,
        updated_at
      FROM metadata_values
      WHERE document_instance_id = $1
      ORDER BY created_at ASC
      `,
      [documentId],
    ),
  ]);

  return {
    ...doc,
    id: doc.id,
    parentDocumentId: doc.parent_document_id,
    currentStepName: doc.current_step_name,
    currentStepOrderIndex: doc.current_step_order_index,
    responsibleId: doc.responsible_id,
    responsibleName: doc.responsible_name,
    createdById: doc.created_by_id,
    createdByName: doc.created_by_name,
    dueDate: doc.due_date,
    tasks: tasksResult.rows.map((t: any) => ({
      id: t.id,
      workflowStepId: t.step_order_index ? String(t.step_order_index) : '',
      stepName: t.step_name,
      elementId: t.element_id,
      assignedToUserId: t.assigned_user_id,
      assignedToUserName: t.assigned_user_name,
      status: t.status,
      actionTaken: t.action_taken,
      comment: t.comment,
      dueAt: t.due_date,
      completedAt: t.completed_at,
      createdAt: t.created_at,
      allowedActions: t.allowed_actions ?? [],
      taskActions: t.task_actions ?? [],
    })),
    auditLogs: auditLogsResult.rows.map((l: any) => ({
      id: l.id,
      action: l.action,
      stepName: l.step_name,
      userName: l.user_name,
      comment: l.comment,
      metadata: l.metadata,
      createdAt: l.created_at,
    })),
    metadataValues: metadataValuesResult.rows.map((m: any) => ({
      id: m.id,
      metadataDefinitionId: m.metadata_definition_id,
      accountId: m.account_id,
      processId: m.process_id,
      value: m.value,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
  };
}

async function findAll(req: Request, res: Response) {
  try {
    const filters: DocumentFilters = {
      accountId: req.query.accountId as string | undefined,
      processId: req.query.processId as string | undefined,
      status: req.query.status as string | undefined,
      createdById: req.query.createdById as string | undefined,
    };

    const { whereClause, values } = buildFindAllWhere(filters);

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        process_id,
        process_name,
        title,
        code,
        revision,
        parent_document_id,
        status,
        workflow_id,
        workflow_name,
        current_step_name,
        current_step_order_index,
        responsible_id,
        responsible_name,
        created_by_id,
        created_by_name,
        due_date,
        created_at,
        updated_at
      FROM document_instances
      ${whereClause}
      ORDER BY created_at DESC
      `,
      values,
    );

    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar documentos.',
      error: error.message,
    });
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        process_id,
        process_name,
        title,
        code,
        revision,
        parent_document_id,
        status,
        workflow_id,
        workflow_name,
        current_step_name,
        current_step_order_index,
        responsible_id,
        responsible_name,
        created_by_id,
        created_by_name,
        due_date,
        created_at,
        updated_at
      FROM document_instances
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Documento ${id} não encontrado`,
      });
    }

    const enriched = await enrichDocument(id, result.rows[0]);
    return res.json(enriched);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar documento.',
      error: error.message,
    });
  }
}

async function create(req: Request, res: Response) {
  const client = await db.pool.connect();

  try {
    const {
      accountId,
      processId,
      processName,
      title,
      workflowId,
      workflowName,
      createdById,
      createdByName,
      initialMetadataValues,
    } = req.body;

    await client.query('BEGIN');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS total FROM document_instances WHERE account_id = $1`,
      [accountId],
    );

    const total = countResult.rows[0]?.total ?? 0;
    const code = `DOC-${new Date().getFullYear()}-${String(total + 1).padStart(4, '0')}`;

    const created = await client.query(
      `
      INSERT INTO document_instances (
        account_id,
        process_id,
        process_name,
        title,
        code,
        revision,
        status,
        workflow_id,
        workflow_name,
        created_by_id,
        created_by_name,
        responsible_id,
        responsible_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING
        id,
        account_id,
        process_id,
        process_name,
        title,
        code,
        revision,
        parent_document_id,
        status,
        workflow_id,
        workflow_name,
        current_step_name,
        current_step_order_index,
        responsible_id,
        responsible_name,
        created_by_id,
        created_by_name,
        due_date,
        created_at,
        updated_at
      `,
      [
        accountId,
        processId,
        processName ?? '',
        title,
        code,
        '00',
        'draft',
        workflowId,
        workflowName ?? '',
        createdById,
        createdByName,
        createdById,
        createdByName,
      ],
    );

    const doc = created.rows[0];

    if (initialMetadataValues && typeof initialMetadataValues === 'object') {
      const entries = Object.entries(initialMetadataValues).filter(([, value]) => value !== null && value !== undefined);

      for (const [metadataDefinitionId, value] of entries) {
        await client.query(
          `
          INSERT INTO metadata_values (
            document_instance_id,
            metadata_definition_id,
            account_id,
            process_id,
            value
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (document_instance_id, metadata_definition_id)
          DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()
          `,
          [doc.id, metadataDefinitionId, accountId, processId, JSON.stringify(value)],
        );
      }
    }

    await client.query(
      `
      INSERT INTO audit_logs (
        document_instance_id,
        action,
        step_name,
        user_name,
        comment,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        doc.id,
        'DocumentCreated',
        null,
        createdByName ?? 'Sistema',
        'Documento criado',
        JSON.stringify({ workflowId, workflowName }),
      ],
    );

    await client.query('COMMIT');

    const enriched = await enrichDocument(doc.id, doc);

    return res.status(201).json(enriched);
  } catch (error: any) {
    await client.query('ROLLBACK');

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar documento.',
      error: error.message,
    });
  } finally {
    client.release();
  }
}

async function cancel(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const executorName = req.body?.executorName ?? req.body?.userName ?? 'Sistema';

    const updated = await db.query(
      `
      UPDATE document_instances
      SET
        status = 'cancelled',
        current_step_name = NULL,
        current_step_order_index = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Documento ${id} não encontrado`,
      });
    }

    await db.query(
      `
      INSERT INTO audit_logs (
        document_instance_id,
        action,
        step_name,
        user_name,
        comment,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        'DocumentoCancelled',
        null,
        executorName,
        'Documento cancelado',
        JSON.stringify({ source: 'documentsController.cancel' }),
      ],
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao cancelar documento.',
      error: error.message,
    });
  }
}

async function cancelPatch(req: Request, res: Response) {
  return cancel(req, res);
}

async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const updated = await db.query(
      `
      UPDATE document_instances
      SET
        status = 'cancelled',
        current_step_name = NULL,
        current_step_order_index = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [id],
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Documento ${id} não encontrado`,
      });
    }

    await db.query(
      `
      INSERT INTO audit_logs (
        document_instance_id,
        action,
        step_name,
        user_name,
        comment,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        'DocumentoCancelled',
        null,
        'Sistema',
        'Documento cancelado via delete lógico',
        JSON.stringify({ source: 'documentsController.remove' }),
      ],
    );

    return res.status(204).send();
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover documento.',
      error: error.message,
    });
  }
}

export default {
  findAll,
  findOne,
  create,
  cancel,
  cancelPatch,
  remove,
};
