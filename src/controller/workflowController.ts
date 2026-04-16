import { Request, Response } from 'express';
import db from '../config/database';

async function startWorkflow(req: Request, res: Response) {
  try {
    const { document_id, workflow_id, started_by } = req.body;

    const result = await db.query(
      `
      INSERT INTO workflow_instances (document_id, workflow_id, status, started_by, started_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
      RETURNING id, document_id, workflow_id, status, started_by, started_at, created_at, updated_at
      `,
      [document_id, workflow_id, 'started', started_by ?? null],
    );

    return res.status(201).json({ success: true, message: 'Workflow iniciado com sucesso.', data: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao iniciar workflow.', error: error.message });
  }
}

async function executeTransition(req: Request, res: Response) {
  try {
    const { workflow_instance_id, from_step, to_step, outcome, executed_by, comment } = req.body;

    const historyResult = await db.query(
      `
      INSERT INTO workflow_history (workflow_instance_id, from_step, to_step, outcome, executed_by, comment, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id, workflow_instance_id, from_step, to_step, outcome, executed_by, comment, created_at
      `,
      [workflow_instance_id, from_step, to_step, outcome, executed_by ?? null, comment ?? null],
    );

    await db.query(
      `
      UPDATE workflow_instances
      SET current_step = $1, updated_at = NOW()
      WHERE id = $2
      `,
      [to_step, workflow_instance_id],
    );

    return res.json({ success: true, message: 'Transição executada com sucesso.', data: historyResult.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao executar transição.', error: error.message });
  }
}

async function getWorkflowHistory(req: Request, res: Response) {
  try {
    const { documentId } = req.params;
    const result = await db.query(
      `
      SELECT wh.*
      FROM workflow_history wh
      INNER JOIN workflow_instances wi ON wi.id = wh.workflow_instance_id
      WHERE wi.document_id = $1
      ORDER BY wh.created_at DESC
      `,
      [documentId],
    );

    return res.json({ success: true, message: 'Histórico do workflow listado com sucesso.', data: result.rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar histórico do workflow.', error: error.message });
  }
}

export default {
  startWorkflow,
  executeTransition,
  getWorkflowHistory,
};
