// import { Request, Response } from 'express'
// import db from '../config/database'
// import { XMLParser } from 'fast-xml-parser'


// type AuthenticatedRequest = Request & {
//   user?: {
//     id: string
//     email?: string
//     name?: string
//     role?: string
//     accountId?: string
//   }
// }

// export type CreateTaskPayload = {
//   documentInstanceId: string
//   stepOrderIndex?: number | null
//   stepName?: string | null
//   elementId?: string | null
//   assignedUserId?: string | null
//   assignedUserName?: string | null
//   dueDate?: string | null
//   allowedActions?: unknown[]
//   taskActions?: unknown[]
// }

// function normalizeRequestedStatus(value: unknown): string | undefined {
//   if (typeof value !== 'string') return undefined

//   const normalized = value.trim().toLowerCase()

//   if (!normalized) return undefined
//   if (normalized === 'pendente') return 'pending'
//   if (normalized === 'concluida' || normalized === 'concluída') return 'completed'
//   if (normalized === 'cancelada') return 'cancelled'

//   return normalized
// }

// // Extrai mapa de sequenceFlowId -> targetRef do BPMN XML
// function extractFlowTargets(bpmnXml: string): Map<string, string> {
//   const map = new Map<string, string>()
//   if (!bpmnXml) return map

//   try {
//     const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
//     const parsed = parser.parse(bpmnXml)

//     const definitions = parsed['bpmn:definitions'] ?? parsed['definitions'] ?? {}
//     const process =
//       definitions['bpmn:process'] ??
//       definitions['process'] ??
//       Object.values(definitions).find((v: any) => v?.['bpmn:sequenceFlow'] || v?.sequenceFlow) ??
//       {}

//     const rawFlows =
//       process['bpmn:sequenceFlow'] ??
//       process['sequenceFlow'] ??
//       []

//     const flows = Array.isArray(rawFlows) ? rawFlows : [rawFlows]

//     for (const flow of flows) {
//       const id = String(flow?.['@_id'] ?? '')
//       const target = String(flow?.['@_targetRef'] ?? '')
//       if (id && target) map.set(id, target)
//     }
//   } catch (err) {
//     console.error('[extractFlowTargets] erro ao parsear BPMN XML =>', err)
//   }

//   return map
// }


// async function findTaskById(taskId: string, executor: any) {
//   const result = await executor.query(
//     `
//     SELECT
//       t.id,
//       t.document_instance_id AS "documentInstanceId",
//       di.title AS "documentTitle",
//       di.code AS "documentCode",
//       t.step_order_index AS "stepOrderIndex",
//       t.step_name AS "stepName",
//       t.element_id AS "elementId",
//       t.assigned_user_id AS "assignedToUserId",
//       t.assigned_user_name AS "assignedToUserName",
//       t.status,
//       t.action_taken AS "actionTaken",
//       t.comment,
//       t.due_date AS "dueAt",
//       t.completed_at AS "completedAt",
//       t.allowed_actions AS "allowedActions",
//       t.task_actions AS "taskActions",
//       t.created_at AS "createdAt",
//       t.updated_at AS "updatedAt"
//     FROM tasks t
//     LEFT JOIN document_instances di
//       ON di.id = t.document_instance_id
//     WHERE t.id = $1
//     LIMIT 1
//     `,
//     [taskId],
//   )

//   return result.rows[0] ?? null
// }

// export async function createPendingTask(
//   payload: CreateTaskPayload,
//   executor?: any,
// ) {
//   const conn = executor ?? db

//   const documentInstanceId = String(payload.documentInstanceId ?? '').trim()
//   const elementId = String(payload.elementId ?? '').trim()
//   const assignedUserId = String(payload.assignedUserId ?? '').trim()
//   const assignedUserName = String(payload.assignedUserName ?? '').trim()
//   const stepName = String(payload.stepName ?? '').trim()

//   const stepOrderIndex =
//     payload.stepOrderIndex === undefined || payload.stepOrderIndex === null
//       ? null
//       : Number(payload.stepOrderIndex)

//   const dueDate = payload.dueDate ? String(payload.dueDate).trim() : null
//   const allowedActions = Array.isArray(payload.allowedActions)
//     ? payload.allowedActions
//     : []
//   const taskActions = Array.isArray(payload.taskActions)
//     ? payload.taskActions
//     : []

//   if (!documentInstanceId) {
//     throw new Error('documentInstanceId é obrigatório.')
//   }

//   if (!elementId) {
//     throw new Error('elementId é obrigatório.')
//   }

//   if (!assignedUserId) {
//     throw new Error('assignedUserId é obrigatório.')
//   }

//   const existingPendingTask = await conn.query(
//     `
//     SELECT
//       id,
//       document_instance_id AS "documentInstanceId",
//       step_order_index AS "stepOrderIndex",
//       step_name AS "stepName",
//       element_id AS "elementId",
//       assigned_user_id AS "assignedToUserId",
//       assigned_user_name AS "assignedToUserName",
//       status,
//       action_taken AS "actionTaken",
//       comment,
//       due_date AS "dueAt",
//       completed_at AS "completedAt",
//       allowed_actions AS "allowedActions",
//       task_actions AS "taskActions",
//       created_at AS "createdAt",
//       updated_at AS "updatedAt"
//     FROM tasks
//     WHERE document_instance_id = $1
//       AND element_id = $2
//       AND assigned_user_id = $3
//       AND status = 'pending'
//     LIMIT 1
//     `,
//     [documentInstanceId, elementId, assignedUserId],
//   )

//   if (existingPendingTask.rows[0]) {
//     return {
//       created: false,
//       reason: 'Já existe task pendente para este documento/etapa/responsável.',
//       task: existingPendingTask.rows[0],
//     }
//   }

//   const insertResult = await conn.query(
//     `
//     INSERT INTO tasks (
//       document_instance_id,
//       step_order_index,
//       step_name,
//       element_id,
//       assigned_user_id,
//       assigned_user_name,
//       status,
//       due_date,
//       allowed_actions,
//       task_actions,
//       created_at,
//       updated_at
//     )
//     VALUES (
//       $1, $2, $3, $4, $5, $6, 'pending', $7, $8::jsonb, $9::jsonb, NOW(), NOW()
//     )
//     RETURNING
//       id,
//       document_instance_id AS "documentInstanceId",
//       step_order_index AS "stepOrderIndex",
//       step_name AS "stepName",
//       element_id AS "elementId",
//       assigned_user_id AS "assignedToUserId",
//       assigned_user_name AS "assignedToUserName",
//       status,
//       action_taken AS "actionTaken",
//       comment,
//       due_date AS "dueAt",
//       completed_at AS "completedAt",
//       allowed_actions AS "allowedActions",
//       task_actions AS "taskActions",
//       created_at AS "createdAt",
//       updated_at AS "updatedAt"
//     `,
//     [
//       documentInstanceId,
//       Number.isFinite(stepOrderIndex as number) ? stepOrderIndex : null,
//       stepName || null,
//       elementId,
//       assignedUserId,
//       assignedUserName || null,
//       dueDate || null,
//       JSON.stringify(allowedActions),
//       JSON.stringify(taskActions),
//     ],
//   )

//   return {
//     created: true,
//     reason: null,
//     task: insertResult.rows[0],
//   }
// }

// async function findMy(req: AuthenticatedRequest, res: Response) {
//   try {
//     const userId = req.user?.id
//     const requestedStatus = normalizeRequestedStatus(req.query.status)

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: 'Usuário não autenticado.',
//       })
//     }

//     const params: any[] = [userId]
//     let statusSql = ''

//     if (requestedStatus) {
//       params.push(requestedStatus)
//       statusSql = ` AND t.status = $${params.length} `
//     }

//     const result = await db.query(
//       `
//       SELECT
//         t.id,
//         t.document_instance_id AS "documentInstanceId",
//         di.title AS "documentTitle",
//         di.code AS "documentCode",
//         t.step_order_index AS "stepOrderIndex",
//         t.step_name AS "stepName",
//         t.element_id AS "elementId",
//         t.assigned_user_id AS "assignedToUserId",
//         t.assigned_user_name AS "assignedToUserName",
//         t.status,
//         t.action_taken AS "actionTaken",
//         t.comment,
//         t.due_date AS "dueAt",
//         t.completed_at AS "completedAt",
//         t.allowed_actions AS "allowedActions",
//         t.task_actions AS "taskActions",
//         t.created_at AS "createdAt",
//         t.updated_at AS "updatedAt"
//       FROM tasks t
//       LEFT JOIN document_instances di
//         ON di.id = t.document_instance_id
//       WHERE t.assigned_user_id = $1
//         ${statusSql}
//       ORDER BY
//         CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
//         t.created_at DESC
//       `,
//       params,
//     )

//     return res.status(200).json(result.rows)
//   } catch (error: any) {
//     console.error('[tasksController.findMy] error =>', error)

//     return res.status(500).json({
//       success: false,
//       message: 'Erro ao buscar tarefas.',
//       error: error?.message ?? 'Unknown error',
//     })
//   }
// }

// async function execute(req: AuthenticatedRequest, res: Response) {
//   const client = await db.pool.connect()

//   try {
//     const userId = req.user?.id
//     const userName = req.user?.name ?? null
//     const taskId = String(req.params.id ?? '').trim()
//     const outcome = String(req.body?.outcome ?? '').trim()
//     const comment = String(req.body?.comment ?? '').trim()
//     const actionId = String(req.body?.actionId ?? '').trim()

//     if (!userId) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' })
//     if (!taskId) return res.status(400).json({ success: false, message: 'O id da task é obrigatório.' })
//     if (!outcome) return res.status(400).json({ success: false, message: 'O outcome da ação é obrigatório.' })

//     await client.query('BEGIN')

//     const currentTask = await findTaskById(taskId, client)
//     if (!currentTask) {
//       await client.query('ROLLBACK')
//       return res.status(404).json({ success: false, message: 'Task não encontrada.' })
//     }
//     if (currentTask.assignedToUserId !== userId) {
//       await client.query('ROLLBACK')
//       return res.status(403).json({ success: false, message: 'Você não tem permissão para executar esta task.' })
//     }
//     if (currentTask.status !== 'pending') {
//       await client.query('ROLLBACK')
//       return res.status(400).json({ success: false, message: 'A task informada não está pendente.' })
//     }

//     const actionTaken = actionId || outcome

//     // 1. Completa a task atual
//     const completedTaskResult = await client.query(
//       `UPDATE tasks
//        SET status = 'completed', action_taken = $2, comment = $3,
//            completed_at = NOW(), updated_at = NOW()
//        WHERE id = $1
//        RETURNING *`,
//       [taskId, actionTaken, comment || null],
//     )
//     const completedTask = completedTaskResult.rows[0]

//     // 2. Busca o documento
//     const docResult = await client.query(
//       `SELECT id, workflow_id, status, current_step_name, current_step_order_index,
//               responsible_id, responsible_name, created_by_id, created_by_name
//        FROM document_instances WHERE id = $1`,
//       [currentTask.documentInstanceId],
//     )
//     const doc = docResult.rows[0]
//     if (!doc) {
//       await client.query('ROLLBACK')
//       return res.status(404).json({ success: false, message: 'Documento não encontrado.' })
//     }

//     // 3. Busca workflow (element_configs + bpmn_xml)
//     const wfResult = await client.query(
//       `SELECT element_configs, bpmn_xml FROM workflows WHERE id = $1`,
//       [doc.workflow_id],
//     )
//     const elementConfigs: any[] = wfResult.rows[0]?.element_configs ?? []
//     const bpmnXml: string = wfResult.rows[0]?.bpmn_xml ?? ''

//     // 4. Mapa de sequenceFlow -> targetRef do BPMN
//     const flowTargetMap = extractFlowTargets(bpmnXml)
//     console.log('[execute] flowTargetMap =>', Object.fromEntries(flowTargetMap))

//     // 5. Config da etapa atual
//     const currentElementConfig = elementConfigs.find(
//       (c: any) => String(c.elementId ?? '') === String(currentTask.elementId),
//     ) ?? null
//     console.log('[execute] currentElementConfig =>', currentElementConfig?.elementId, currentElementConfig?.kind)

//     // 6. Determina nextElementId
//     let nextElementId: string | null = null

//     // 6a. Tenta pelo taskActions (nextElementId direto na ação)
//     const taskActions: any[] = Array.isArray(currentTask.taskActions) ? currentTask.taskActions : []
//     const executedAction = taskActions.find(
//       (a: any) => String(a.id ?? '') === actionId || String(a.outcome ?? '') === outcome,
//     ) ?? null

//     if (executedAction?.nextElementId) {
//       nextElementId = String(executedAction.nextElementId)
//       console.log('[execute] nextElementId via taskActions =>', nextElementId)
//     }

//     // 6b. Tenta pelo gateway: acha se o próximo elemento é um gateway,
//     //     e resolve qual sequenceFlow corresponde à ação executada
//     if (!nextElementId && currentElementConfig) {
//       // Acha todos os gateways que têm actionRoutes referenciando a ação atual
//       const gateway = elementConfigs.find((c: any) => {
//         if (c.kind !== 'gateway') return false
//         const routes: any[] = Array.isArray(c.config?.actionRoutes) ? c.config.actionRoutes : []
//         return routes.some(
//           (r: any) => String(r.actionId ?? '') === actionId || String(r.actionLabel ?? '').toLowerCase() === outcome,
//         )
//       }) ?? null

//       console.log('[execute] gateway encontrado =>', gateway?.elementId)

//       if (gateway) {
//         const routes: any[] = Array.isArray(gateway.config?.actionRoutes) ? gateway.config.actionRoutes : []
//         const matchedRoute = routes.find(
//           (r: any) => String(r.actionId ?? '') === actionId || String(r.actionLabel ?? '').toLowerCase() === outcome,
//         ) ?? null

//         console.log('[execute] matchedRoute =>', matchedRoute)

//         if (matchedRoute?.sequenceFlowId) {
//           const targetViaFlow = flowTargetMap.get(matchedRoute.sequenceFlowId) ?? null
//           console.log('[execute] targetViaFlow =>', targetViaFlow)

//           if (targetViaFlow) {
//             // Se o target ainda é um gateway, continua resolvendo (gateway encadeado)
//             const targetConfig = elementConfigs.find((c: any) => String(c.elementId ?? '') === targetViaFlow)
//             if (targetConfig?.kind === 'gateway') {
//               // Gateway encadeado — pega o primeiro flow de saída dele
//               const nextFlow = [...flowTargetMap.entries()].find(([flowId]) => {
//                 // Procura flows cujo source seja este gateway no BPMN XML
//                 return bpmnXml.includes(`sourceRef="${targetViaFlow}"`) &&
//                   bpmnXml.includes(`id="${flowId}"`)
//               })
//               nextElementId = nextFlow?.[1] ?? targetViaFlow
//             } else {
//               nextElementId = targetViaFlow
//             }
//           }
//         }
//       }
//     }

//     // 6c. Fallback: próxima activity por ordem no array
//     if (!nextElementId) {
//       const activities = elementConfigs.filter((c: any) => c.kind === 'activity')
//       const currentIndex = activities.findIndex(
//         (c: any) => String(c.elementId ?? '') === String(currentTask.elementId),
//       )
//       if (currentIndex >= 0 && currentIndex < activities.length - 1) {
//         nextElementId = String(activities[currentIndex + 1].elementId)
//         console.log('[execute] nextElementId via fallback por ordem =>', nextElementId)
//       }
//     }

//     console.log('[execute] nextElementId final =>', nextElementId)

//     // 7. Config da próxima etapa
//     const nextElementConfig = nextElementId
//       ? elementConfigs.find((c: any) => String(c.elementId ?? '') === nextElementId) ?? null
//       : null
//     const nextConfig = nextElementConfig?.config ?? null
//     const isEndEvent = nextElementConfig?.kind === 'end'

//     // 8. Atualiza documento
//     let newStatus = doc.status
//     let newStepName: string | null = nextElementConfig?.elementName ?? nextElementId ?? null
//     let newStepOrderIndex: number | null = null

//     // Calcula orderIndex baseado na posição no array de activities
//     const allActivities = elementConfigs.filter((c: any) => c.kind === 'activity')
//     const nextActivityIndex = allActivities.findIndex(
//       (c: any) => String(c.elementId ?? '') === nextElementId,
//     )
//     if (nextActivityIndex >= 0) newStepOrderIndex = nextActivityIndex

//     if (isEndEvent) {
//       const finalAction = nextConfig?.finalAction ?? 'complete'
//       newStatus = finalAction === 'publish' ? 'published'
//         : finalAction === 'archive' ? 'archived'
//           : 'completed'
//       newStepName = null
//       newStepOrderIndex = null
//     }

//     const nextResponsibleIds: string[] = Array.isArray(nextConfig?.responsibleUserIds)
//       ? nextConfig.responsibleUserIds.map(String).filter(Boolean)
//       : []
//     const nextResponsibleId = nextResponsibleIds[0] ?? doc.responsible_id
//     const nextResponsibleName = nextResponsibleIds[0] ? null : doc.responsible_name

//     await client.query(
//       `UPDATE document_instances
//        SET current_step_name = $2, current_step_order_index = $3, status = $4,
//            responsible_id = $5, responsible_name = $6, updated_at = NOW()
//        WHERE id = $1`,
//       [doc.id, newStepName, newStepOrderIndex, newStatus, nextResponsibleId, nextResponsibleName],
//     )

//     // 9. Audit log
//     await client.query(
//       `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [
//         doc.id, outcome, currentTask.stepName ?? null, userName ?? userId, comment || null,
//         JSON.stringify({ taskId, actionTaken, fromElementId: currentTask.elementId, toElementId: nextElementId }),
//       ],
//     )

//     // 10. Cria task da próxima etapa
//     let nextTask = null
//     if (!isEndEvent && nextElementConfig?.kind === 'activity' && nextElementId) {
//       const rawActions: any[] = Array.isArray(nextConfig?.actions) ? nextConfig.actions : []
//       const nextAllowedActions = rawActions.map((a: any) => String(a?.outcome ?? ''))
//       const nextTaskActions = rawActions.map((a: any, i: number) => ({
//         id: String(a?.id ?? `${nextElementId}-${i}`),
//         label: String(a?.actionLabel ?? a?.label ?? a?.outcome ?? `Ação ${i + 1}`),
//         outcome: String(a?.outcome ?? `action-${i + 1}`),
//         color: String(a?.buttonColor ?? a?.color ?? '#1677ff'),
//         requiresComment: Boolean(a?.requiresComment),
//         nextElementId: a?.nextElementId ?? null,
//       }))

//       let dueDate: string | null = null
//       if (nextConfig?.deadlineMode && nextConfig?.deadlineValue) {
//         const value = Number(nextConfig.deadlineValue)
//         if (Number.isFinite(value) && value > 0) {
//           const due = new Date()
//           if (nextConfig.deadlineMode === 'hours') due.setHours(due.getHours() + value)
//           if (nextConfig.deadlineMode === 'days') due.setDate(due.getDate() + value)
//           dueDate = due.toISOString()
//         }
//       }

//       const assignedUserId = nextResponsibleIds[0] ?? userId
//       const assignedUserName = nextResponsibleIds[0] ? null : (userName ?? null)

//       const created = await createPendingTask(
//         {
//           documentInstanceId: doc.id,
//           stepOrderIndex: newStepOrderIndex,
//           stepName: newStepName,
//           elementId: nextElementId,
//           assignedUserId,
//           assignedUserName,
//           dueDate,
//           allowedActions: nextAllowedActions,
//           taskActions: nextTaskActions,
//         },
//         client,
//       )
//       nextTask = created.task
//     }

//     await client.query('COMMIT')

//     return res.status(200).json({
//       success: true,
//       message: 'Ação executada com sucesso.',
//       task: completedTask,
//       nextTask,
//       documentStatus: newStatus,
//     })
//   } catch (error: any) {
//     await client.query('ROLLBACK')
//     console.error('[tasksController.execute] error =>', error)
//     return res.status(500).json({
//       success: false,
//       message: 'Erro ao executar task.',
//       error: error?.message ?? 'Unknown error',
//     })
//   } finally {
//     client.release()
//   }
// }

// async function create(req: AuthenticatedRequest, res: Response) {
//   const client = await db.pool.connect()

//   try {
//     const payload: CreateTaskPayload = {
//       documentInstanceId: String(req.body?.documentInstanceId ?? '').trim(),
//       stepOrderIndex:
//         req.body?.stepOrderIndex === undefined || req.body?.stepOrderIndex === null
//           ? null
//           : Number(req.body.stepOrderIndex),
//       stepName: req.body?.stepName ? String(req.body.stepName).trim() : null,
//       elementId: req.body?.elementId ? String(req.body.elementId).trim() : null,
//       assignedUserId: req.body?.assignedUserId
//         ? String(req.body.assignedUserId).trim()
//         : null,
//       assignedUserName: req.body?.assignedUserName
//         ? String(req.body.assignedUserName).trim()
//         : null,
//       dueDate: req.body?.dueDate ? String(req.body.dueDate).trim() : null,
//       allowedActions: Array.isArray(req.body?.allowedActions)
//         ? req.body.allowedActions
//         : [],
//       taskActions: Array.isArray(req.body?.taskActions)
//         ? req.body.taskActions
//         : [],
//     }

//     await client.query('BEGIN')

//     const created = await createPendingTask(payload, client)

//     await client.query('COMMIT')

//     return res.status(200).json({
//       success: true,
//       created: created.created,
//       reason: created.reason,
//       task: created.task,
//     })
//   } catch (error: any) {
//     await client.query('ROLLBACK')
//     console.error('[tasksController.create] error =>', error)

//     const message = String(error?.message ?? '')

//     if (
//       message === 'documentInstanceId é obrigatório.' ||
//       message === 'elementId é obrigatório.' ||
//       message === 'assignedUserId é obrigatório.'
//     ) {
//       return res.status(400).json({
//         success: false,
//         message,
//       })
//     }

//     return res.status(500).json({
//       success: false,
//       message: 'Erro ao criar task.',
//       error: error?.message ?? 'Unknown error',
//     })
//   } finally {
//     client.release()
//   }
// }

// export default {
//   findMy,
//   execute,
//   create,
// }


import { Request, Response } from 'express'
import db from '../config/database'

type AuthenticatedRequest = Request & {
  user?: {
    id: string
    email?: string
    name?: string
    role?: string
    accountId?: string
  }
}

export type CreateTaskPayload = {
  documentInstanceId: string
  stepOrderIndex?: number | null
  stepName?: string | null
  elementId?: string | null
  assignedUserId?: string | null
  assignedUserName?: string | null
  dueDate?: string | null
  allowedActions?: unknown[]
  taskActions?: unknown[]
}

function normalizeRequestedStatus(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const normalized = value.trim().toLowerCase()

  if (!normalized) return undefined
  if (normalized === 'pendente') return 'pending'
  if (normalized === 'concluida' || normalized === 'concluída') return 'completed'
  if (normalized === 'cancelada') return 'cancelled'

  return normalized
}

export async function findPendingTaskByDocumentStep(
  documentInstanceId: string,
  elementId: string,
  assignedUserId: string,
  executor?: any,
) {
  const conn = executor ?? db

  const result = await conn.query(
    `
    SELECT
      id,
      document_instance_id AS "documentInstanceId",
      step_order_index AS "stepOrderIndex",
      step_name AS "stepName",
      element_id AS "elementId",
      assigned_user_id AS "assignedToUserId",
      assigned_user_name AS "assignedToUserName",
      status,
      action_taken AS "actionTaken",
      comment,
      due_date AS "dueAt",
      completed_at AS "completedAt",
      allowed_actions AS "allowedActions",
      task_actions AS "taskActions",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tasks
    WHERE document_instance_id = $1
      AND element_id = $2
      AND assigned_user_id = $3
      AND status = 'pending'
    LIMIT 1
    `,
    [documentInstanceId, elementId, assignedUserId],
  )

  return result.rows[0] ?? null
}

export async function createPendingTask(
  payload: CreateTaskPayload,
  executor?: any,
) {
  const conn = executor ?? db

  const documentInstanceId = String(payload.documentInstanceId ?? '').trim()
  const elementId = String(payload.elementId ?? '').trim()
  const assignedUserId = String(payload.assignedUserId ?? '').trim()
  const assignedUserName = String(payload.assignedUserName ?? '').trim()
  const stepName = String(payload.stepName ?? '').trim()

  const stepOrderIndex =
    payload.stepOrderIndex === undefined || payload.stepOrderIndex === null
      ? null
      : Number(payload.stepOrderIndex)

  const dueDate = payload.dueDate ? String(payload.dueDate).trim() : null
  const allowedActions = Array.isArray(payload.allowedActions)
    ? payload.allowedActions
    : []
  const taskActions = Array.isArray(payload.taskActions)
    ? payload.taskActions
    : []

  if (!documentInstanceId || !elementId || !assignedUserId) {
    return {
      created: false,
      reason: 'Dados insuficientes para criar task.',
      task: null,
    }
  }

  const existingPendingTask = await findPendingTaskByDocumentStep(
    documentInstanceId,
    elementId,
    assignedUserId,
    conn,
  )

  if (existingPendingTask) {
    return {
      created: false,
      reason: 'Já existe task pendente para este documento/etapa/responsável.',
      task: existingPendingTask,
    }
  }

  const insertResult = await conn.query(
    `
    INSERT INTO tasks (
      document_instance_id,
      step_order_index,
      step_name,
      element_id,
      assigned_user_id,
      assigned_user_name,
      status,
      due_date,
      allowed_actions,
      task_actions,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, 'pending', $7, $8::jsonb, $9::jsonb, NOW(), NOW()
    )
    RETURNING
      id,
      document_instance_id AS "documentInstanceId",
      step_order_index AS "stepOrderIndex",
      step_name AS "stepName",
      element_id AS "elementId",
      assigned_user_id AS "assignedToUserId",
      assigned_user_name AS "assignedToUserName",
      status,
      action_taken AS "actionTaken",
      comment,
      due_date AS "dueAt",
      completed_at AS "completedAt",
      allowed_actions AS "allowedActions",
      task_actions AS "taskActions",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `,
    [
      documentInstanceId,
      Number.isFinite(stepOrderIndex as number) ? stepOrderIndex : null,
      stepName || null,
      elementId,
      assignedUserId,
      assignedUserName || null,
      dueDate || null,
      JSON.stringify(allowedActions),
      JSON.stringify(taskActions),
    ],
  )

  return {
    created: true,
    reason: null,
    task: insertResult.rows[0],
  }
}

export async function completePendingTaskIfExists(params: {
  documentInstanceId: string
  elementId: string
  assignedUserId: string
  outcome: string
  comment?: string
  actionId?: string
  executor?: any
}) {
  const conn = params.executor ?? db

  const pendingTask = await findPendingTaskByDocumentStep(
    params.documentInstanceId,
    params.elementId,
    params.assignedUserId,
    conn,
  )

  if (!pendingTask) {
    return {
      completed: false,
      reason: 'Nenhuma task pendente encontrada para a etapa atual.',
      task: null,
    }
  }

  const actionTaken =
    String(params.actionId ?? '').trim() || String(params.outcome ?? '').trim()

  const result = await conn.query(
    `
    UPDATE tasks
    SET
      status = 'completed',
      action_taken = $2,
      comment = $3,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      document_instance_id AS "documentInstanceId",
      step_order_index AS "stepOrderIndex",
      step_name AS "stepName",
      element_id AS "elementId",
      assigned_user_id AS "assignedToUserId",
      assigned_user_name AS "assignedToUserName",
      status,
      action_taken AS "actionTaken",
      comment,
      due_date AS "dueAt",
      completed_at AS "completedAt",
      allowed_actions AS "allowedActions",
      task_actions AS "taskActions",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `,
    [pendingTask.id, actionTaken, params.comment?.trim() || null],
  )

  return {
    completed: true,
    reason: null,
    task: result.rows[0] ?? null,
  }
}

async function findMy(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id
    const requestedStatus = normalizeRequestedStatus(req.query.status)

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
      })
    }

    const params: any[] = [userId]
    let statusSql = ''

    if (requestedStatus) {
      params.push(requestedStatus)
      statusSql = ` AND t.status = $${params.length} `
    }

    const result = await db.query(
      `
      SELECT
        t.id,
        t.document_instance_id AS "documentInstanceId",
        di.title AS "documentTitle",
        di.code AS "documentCode",
        t.step_order_index AS "stepOrderIndex",
        t.step_name AS "stepName",
        t.element_id AS "elementId",
        t.assigned_user_id AS "assignedToUserId",
        t.assigned_user_name AS "assignedToUserName",
        t.status,
        t.action_taken AS "actionTaken",
        t.comment,
        t.due_date AS "dueAt",
        t.completed_at AS "completedAt",
        t.allowed_actions AS "allowedActions",
        t.task_actions AS "taskActions",
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt"
      FROM tasks t
      LEFT JOIN document_instances di
        ON di.id = t.document_instance_id
      WHERE t.assigned_user_id = $1
        ${statusSql}
      ORDER BY
        CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
        t.created_at DESC
      `,
      params,
    )

    return res.status(200).json(result.rows)
  } catch (error: any) {
    console.error('[tasksController.findMy] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar tarefas.',
      error: error?.message ?? 'Unknown error',
    })
  }
}

async function create(req: AuthenticatedRequest, res: Response) {
  const client = await db.pool.connect()

  try {
    await client.query('BEGIN')

    const created = await createPendingTask(
      {
        documentInstanceId: String(req.body?.documentInstanceId ?? '').trim(),
        stepOrderIndex:
          req.body?.stepOrderIndex === undefined || req.body?.stepOrderIndex === null
            ? null
            : Number(req.body.stepOrderIndex),
        stepName: req.body?.stepName ? String(req.body.stepName).trim() : null,
        elementId: req.body?.elementId ? String(req.body.elementId).trim() : null,
        assignedUserId: req.body?.assignedUserId
          ? String(req.body.assignedUserId).trim()
          : null,
        assignedUserName: req.body?.assignedUserName
          ? String(req.body.assignedUserName).trim()
          : null,
        dueDate: req.body?.dueDate ? String(req.body.dueDate).trim() : null,
        allowedActions: Array.isArray(req.body?.allowedActions)
          ? req.body.allowedActions
          : [],
        taskActions: Array.isArray(req.body?.taskActions)
          ? req.body.taskActions
          : [],
      },
      client,
    )

    await client.query('COMMIT')

    return res.status(200).json({
      success: true,
      created: created.created,
      reason: created.reason,
      task: created.task,
    })
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('[tasksController.create] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar task.',
      error: error?.message ?? 'Unknown error',
    })
  } finally {
    client.release()
  }
}

export default {
  findMy,
  create,
}