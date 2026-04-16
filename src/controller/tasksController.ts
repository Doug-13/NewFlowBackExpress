import { Response } from 'express';
import db from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

function normalizeTask(item: any) {
  if (!item) return item;

  return {
    id: item.id,
    accountId: item.account_id ?? item.accountId,
    processId: item.process_id ?? item.processId,
    processName: item.process_name ?? item.processName ?? '',
    documentInstanceId: item.document_instance_id ?? item.documentInstanceId,
    documentTitle: item.document_title ?? item.documentTitle ?? '',
    documentCode: item.document_code ?? item.documentCode ?? '',
    stepName: item.step_name ?? item.stepName,
    stepOrderIndex: item.step_order_index ?? item.stepOrderIndex,
    elementId: item.element_id ?? item.elementId ?? null,
    assignedToUserId: item.assigned_user_id ?? item.assignedUserId,
    assignedToUserName: item.assigned_user_name ?? item.assignedUserName ?? '',
    status: item.status,
    dueAt: item.due_date ?? item.dueAt ?? null,
    createdAt: item.created_at ?? item.createdAt,
    allowedActions: item.allowed_actions ?? item.allowedActions ?? [],
    taskActions: item.task_actions ?? item.taskActions ?? [],
    actionTaken: item.action_taken ?? item.actionTaken ?? null,
    comment: item.comment ?? null,
    deadlineMode: item.deadline_mode ?? item.deadlineMode ?? null,
    deadlineValue: item.deadline_value ?? item.deadlineValue ?? null,
    completedAt: item.completed_at ?? item.completedAt ?? null,
  };
}

function isValidUuid(value?: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findMy(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        process_id,
        process_name,
        document_instance_id,
        document_title,
        document_code,
        step_name,
        step_order_index,
        element_id,
        assigned_user_id,
        assigned_user_name,
        status,
        allowed_actions,
        task_actions,
        action_taken,
        comment,
        deadline_mode,
        deadline_value,
        due_date,
        completed_at,
        created_at,
        updated_at
      FROM tasks
      WHERE assigned_user_id = $1
        AND status = 'pending'
      ORDER BY created_at DESC
      `,
      [userId],
    );

    return res.json(result.rows.map(normalizeTask));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar minhas tarefas.',
      error: error.message,
    });
  }
}

async function execute(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const dto = req.body ?? {};
    const executorId = req.user?.id;
    const executorName = req.user?.name;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: `ID de tarefa inválido: "${id}"`,
      });
    }

    const taskResult = await db.query(
      `
      SELECT
        id,
        document_instance_id,
        status,
        allowed_actions,
        task_actions
      FROM tasks
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const task = taskResult.rows[0];

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Tarefa ${id} não encontrada`,
      });
    }

    if (task.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Tarefa já concluída',
      });
    }

    await db.query(
      `
      UPDATE tasks
      SET
        status = 'completed',
        action_taken = $1,
        comment = $2,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $3
      `,
      [dto.action, dto.comment ?? null, id],
    );

    await db.query(
      `
      INSERT INTO audit_logs (
        document_instance_id,
        action,
        step_name,
        user_name,
        comment
      )
      VALUES (
        $1,
        'TaskExecuted',
        (
          SELECT step_name
          FROM tasks
          WHERE id = $2
          LIMIT 1
        ),
        $3,
        $4
      )
      `,
      [task.document_instance_id, id, executorName ?? null, dto.comment ?? null],
    );

    return res.json({
      success: true,
      taskId: id,
      outcome: dto.action,
      comment: dto.comment ?? null,
      executorId,
      executorName,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao executar tarefa.',
      error: error.message,
    });
  }
}

export default {
  findMy,
  execute,
};
