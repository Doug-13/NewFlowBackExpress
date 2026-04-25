import { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import db from '../config/database'
import {
  completePendingTaskIfExists,
  createPendingTask,
} from './tasksController'
import { XMLParser } from 'fast-xml-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentFilters = {
  accountId?: string
  processId?: string
  status?: string
  createdById?: string
}

type AuthenticatedRequest = Request & {
  user?: {
    id: string
    email?: string
    name?: string
    role?: string
    accountId?: string
  }
}

type QueryExecutor = {
  query: (text: string, params?: any[]) => Promise<any>
}

type TaskAction = {
  id: string
  label: string
  outcome: string
  color: string
  requiresComment: boolean
  nextElementId: string | null
}

type ResolvedStep = {
  elementId: string
  stepName: string
  stepOrderIndex: number
  allowedActions: string[]
  taskActions: TaskAction[]
  responsibleUserIds: string[]
  deadlineMode: string | null
  deadlineValue: number | null
  finalStatus: string | null

  kind?: string
  elementType?: string | null

  isAutomatic?: boolean
  systemTaskConfig?: SystemTaskConfig | null
  nextElementIdAfterAutomatic?: string | null

  shouldCreateRevision?: boolean
  revisionConfig?: {
    actionType: string
    createNewInstance: boolean
    auditNote?: string | null
  } | null
}

type BpmnNodeInfo = {
  id: string
  type: 'start' | 'activity' | 'gateway' | 'end' | 'passthrough' | 'unknown'
  outgoing: string[]
  defaultFlowId?: string | null
}

type LoggedUser = {
  id?: string
  name?: string
  email?: string
  accountId?: string | null
}

type SystemTaskSubprocessWaitPolicy =
  | 'all'
  | 'any'
  | 'none'
  | 'all_children'
  | 'any_child'

type SystemTaskSubprocessConfig = {
  childProcessId?: string
  childProcessName?: string
  waitForCompletion?: boolean
  waitPolicy?: SystemTaskSubprocessWaitPolicy
  copyParentMetadata?: boolean
  copyParentAttachments?: boolean
  sourceTableFieldIds?: string[]
}

type SystemTaskConfig = {
  actionType: string
  auditNote?: string
  notificationTemplateIds?: string[]
  subprocess?: SystemTaskSubprocessConfig
}

type ExecuteSubprocessSystemTaskParams = {
  parentDocumentInstanceId: string
  currentElementId?: string | null
  parentNextElementId?: string | null
  systemTaskConfig: SystemTaskConfig
  user?: LoggedUser
}

type TableRowContext = {
  tableMetadataDefinitionId: string
  tableName: string
  row: Record<string, any>
  rowIndex: number
}

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null

  const normalized = String(value).trim()

  return normalized || null
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value

  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (['true', '1', 'yes', 'sim', 's'].includes(normalized)) return true
    if (['false', '0', 'no', 'nao', 'não', 'n'].includes(normalized)) {
      return false
    }
  }

  return fallback
}

function normalizeSubprocessWaitConfig(
  subprocessConfig: SystemTaskSubprocessConfig,
): {
  waitForCompletion: boolean
  waitPolicy: 'all_children' | 'any_child'
  frontendWaitPolicy: 'all' | 'any' | 'none'
} {
  const rawWaitPolicy = String((subprocessConfig as any)?.waitPolicy ?? '')
    .trim()
    .toLowerCase()

  if (rawWaitPolicy === 'none') {
    return {
      waitForCompletion: false,
      waitPolicy: 'all_children',
      frontendWaitPolicy: 'none',
    }
  }

  if (rawWaitPolicy === 'any' || rawWaitPolicy === 'any_child') {
    return {
      waitForCompletion: true,
      waitPolicy: 'any_child',
      frontendWaitPolicy: 'any',
    }
  }

  if (rawWaitPolicy === 'all' || rawWaitPolicy === 'all_children') {
    return {
      waitForCompletion: true,
      waitPolicy: 'all_children',
      frontendWaitPolicy: 'all',
    }
  }

  const waitForCompletion = normalizeBoolean(
    subprocessConfig.waitForCompletion,
    true,
  )

  if (!waitForCompletion) {
    return {
      waitForCompletion: false,
      waitPolicy: 'all_children',
      frontendWaitPolicy: 'none',
    }
  }

  return {
    waitForCompletion: true,
    waitPolicy: 'all_children',
    frontendWaitPolicy: 'all',
  }
}

function isFinishedDocumentStatus(status: unknown) {
  const normalized = normalizeText(status)

  return [
    'approved',
    'published',
    'rejected',
    'cancelled',
    'archived',
    'completed',
    'aprovado',
    'publicado',
    'reprovado',
    'cancelado',
    'arquivado',
    'concluido',
    'concluído',
  ].includes(normalized)
}

function safeJsonParse(value: any) {
  if (value === undefined || value === null) return null

  if (typeof value === 'object') return value

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return value
}

function normalizeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {}

  const parsed = safeJsonParse(value)

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, any>
  }

  return {
    value: parsed,
  }
}

function normalizeTableRows(value: any): Record<string, any>[] {
  const parsed = safeJsonParse(value)

  if (Array.isArray(parsed)) {
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as Record<string, any>)
  }

  if (parsed && typeof parsed === 'object') {
    const possibleRows = [
      parsed.rows,
      parsed.items,
      parsed.data,
      parsed.values,
      parsed.tableRows,
      parsed.table_rows,
    ]

    for (const candidate of possibleRows) {
      if (Array.isArray(candidate)) {
        return candidate
          .filter((item) => item && typeof item === 'object')
          .map((item) => item as Record<string, any>)
      }
    }
  }

  return []
}

function normalizeElementConfigs(value: any): any[] {
  const parsed = safeJsonParse(value)

  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.elementConfigs)) return parsed.elementConfigs
  if (Array.isArray(parsed?.configs)) return parsed.configs

  return []
}

function getActionsFromConfig(config: any) {
  if (Array.isArray(config?.actions)) return config.actions
  if (Array.isArray(config?.allowedActions)) return config.allowedActions
  if (Array.isArray(config?.taskActions)) return config.taskActions

  return []
}

function getResponsibleFromConfig(config: any) {
  const responsibleUserId =
    Array.isArray(config?.responsibleUserIds) &&
      config.responsibleUserIds.length > 0
      ? config.responsibleUserIds[0]
      : null

  const responsibleUserName =
    Array.isArray(config?.responsibleUserNames) &&
      config.responsibleUserNames.length > 0
      ? config.responsibleUserNames[0]
      : null

  return {
    responsibleId: responsibleUserId,
    responsibleName: responsibleUserName,
    currentAssignedUserId: responsibleUserId,
    currentAssignedUserName: responsibleUserName,
  }
}

function pickFirstRunnableStepFromWorkflow(elementConfigs: any[]) {
  const activity = elementConfigs.find((item) => {
    const kind = String(item?.kind ?? '').toLowerCase()
    const elementType = String(item?.elementType ?? '').toLowerCase()

    return (
      kind === 'activity' ||
      elementType === 'bpmn:usertask' ||
      elementType === 'bpmn:task'
    )
  })

  if (!activity) {
    return {
      currentElementId: null,
      currentStepName: null,
      currentStepOrderIndex: null,
      responsibleId: null,
      responsibleName: null,
      currentAssignedUserId: null,
      currentAssignedUserName: null,
      allowedActions: [],
      taskActions: [],
    }
  }

  const config = activity.config ?? {}
  const actions = getActionsFromConfig(config)
  const responsible = getResponsibleFromConfig(config)

  return {
    currentElementId: activity.elementId ?? null,
    currentStepName:
      activity.elementName ??
      activity.name ??
      config.name ??
      config.title ??
      'Atividade',
    currentStepOrderIndex: 1,
    responsibleId: responsible.responsibleId,
    responsibleName: responsible.responsibleName,
    currentAssignedUserId: responsible.currentAssignedUserId,
    currentAssignedUserName: responsible.currentAssignedUserName,
    allowedActions: actions,
    taskActions: actions,
  }
}

function buildChildTitle(params: {
  childProcessName?: string | null
  parentCode?: string | null
  parentTitle?: string | null
  tableName?: string | null
  row: Record<string, any>
  rowIndex: number
}) {
  const {
    childProcessName,
    parentCode,
    parentTitle,
    tableName,
    row,
    rowIndex,
  } = params

  const rowTitle =
    row.title ??
    row.titulo ??
    row.name ??
    row.nome ??
    row.description ??
    row.descricao ??
    row.acao ??
    row.action ??
    null

  if (rowTitle) {
    return String(rowTitle)
  }

  const processPart = childProcessName || 'Subprocesso'
  const tablePart = tableName ? ` - ${tableName}` : ''
  const parentPart = parentCode || parentTitle || 'Documento pai'

  return `${processPart}${tablePart} ${rowIndex + 1} - ${parentPart}`
}

function getRowKey(row: Record<string, any>, rowIndex: number) {
  return String(
    row.id ??
    row.key ??
    row.uuid ??
    row.codigo ??
    row.code ??
    row.numero ??
    row.number ??
    rowIndex,
  )
}

async function generateDocumentCode(params: {
  client: any
  accountId: string
  processId: string
}) {
  const { client, accountId, processId } = params

  const result = await client.query(
    `
    SELECT COUNT(*)::int AS total
    FROM documents
    WHERE account_id::text = $1::text
      AND process_id::text = $2::text
    `,
    [accountId, processId],
  )

  const total = Number(result.rows[0]?.total ?? 0) + 1
  const year = new Date().getFullYear()

  return `DOC-${year}-${String(total).padStart(4, '0')}`
}

async function getParentDocumentInstance(params: {
  client: any
  parentDocumentInstanceId: string
}) {
  const { client, parentDocumentInstanceId } = params

  const result = await client.query(
    `
    SELECT
      di.*,
      d.id AS base_document_id,
      d.current_instance_id AS base_current_instance_id
    FROM document_instances di
    INNER JOIN documents d
      ON d.id = di.document_id
    WHERE di.id::text = $1::text
    LIMIT 1
    `,
    [parentDocumentInstanceId],
  )

  return result.rows[0] ?? null
}

async function getChildProcessAndWorkflow(params: {
  client: any
  childProcessId: string
}) {
  const { client, childProcessId } = params

  const result = await client.query(
    `
    SELECT
      p.id AS process_id,
      p.name AS process_name,
      p.account_id AS process_account_id,
      p.workflow_id AS process_workflow_id,

      w.id AS workflow_id,
      w.public_id AS workflow_public_id,
      w.name AS workflow_name,
      w.process_id AS workflow_process_id,
      w.process_name AS workflow_process_name,
      w.element_configs,
      w.status AS workflow_status
    FROM processes p
    LEFT JOIN workflows w
      ON (
        w.id::text = p.workflow_id::text
        OR w.public_id::text = p.workflow_id::text
        OR w.process_id::text = p.id::text
      )
    WHERE p.id::text = $1::text
      AND p.is_active = true
    ORDER BY
      CASE
        WHEN w.status = 'active' THEN 0
        WHEN w.status = 'draft' THEN 1
        ELSE 2
      END,
      w.updated_at DESC NULLS LAST
    LIMIT 1
    `,
    [childProcessId],
  )

  return result.rows[0] ?? null
}

async function getTableMetadataValues(params: {
  client: any
  parentDocumentInstanceId: string
  sourceTableFieldIds: string[]
}) {
  const { client, parentDocumentInstanceId, sourceTableFieldIds } = params

  const result = await client.query(
    `
    SELECT
      mv.id,
      mv.document_instance_id,
      mv.metadata_definition_id,
      mv.account_id,
      mv.process_id,
      mv.value,

      md.name,
      md.label,
      md.field_type,
      md.table_columns
    FROM metadata_values mv
    INNER JOIN metadata_definitions md
      ON md.id::text = mv.metadata_definition_id::text
    WHERE mv.document_instance_id::text = $1::text
      AND mv.metadata_definition_id::text = ANY($2::text[])
      AND LOWER(COALESCE(md.field_type, '')) IN (
        'table',
        'tabela',
        'grid',
        'datatable',
        'data-table',
        'dynamic-table'
      )
    ORDER BY
      md.label ASC,
      md.name ASC
    `,
    [parentDocumentInstanceId, sourceTableFieldIds],
  )

  return result.rows
}

async function copyParentMetadataToChild(params: {
  client: any
  parentDocumentInstanceId: string
  childDocumentInstanceId: string
  accountId: string
  childProcessId: string
  excludeMetadataDefinitionIds: string[]
}) {
  const {
    client,
    parentDocumentInstanceId,
    childDocumentInstanceId,
    accountId,
    childProcessId,
    excludeMetadataDefinitionIds,
  } = params

  await client.query(
    `
    INSERT INTO metadata_values (
      document_instance_id,
      metadata_definition_id,
      account_id,
      process_id,
      value,
      created_at,
      updated_at
    )
    SELECT
      $2::uuid AS document_instance_id,
      mv.metadata_definition_id,
      $3 AS account_id,
      $4 AS process_id,
      mv.value,
      NOW(),
      NOW()
    FROM metadata_values mv
    WHERE mv.document_instance_id::text = $1::text
      AND NOT (mv.metadata_definition_id::text = ANY($5::text[]))
    `,
    [
      parentDocumentInstanceId,
      childDocumentInstanceId,
      accountId,
      childProcessId,
      excludeMetadataDefinitionIds,
    ],
  )
}
// =============================================================================
// FUNÇÕES COMPLETAS COM PATCH APLICADO
// documentsController.ts
//
// Substituir no arquivo original:
//   1. A função createChildDocumentFromRow (completa)
//   2. A função executeAction (completa)
// =============================================================================

async function createChildDocumentFromRow(params: {
  client: any
  parent: any
  childProcess: any
  relationGroupId: string
  tableRowContext: TableRowContext
  subprocessConfig: SystemTaskSubprocessConfig
  currentElementId?: string | null
  parentNextElementId?: string | null
  user?: LoggedUser
}) {
  const {
    client,
    parent,
    childProcess,
    relationGroupId,
    tableRowContext,
    subprocessConfig,
    currentElementId,
    parentNextElementId,
    user,
  } = params

  const accountId = String(parent.account_id)
  const childProcessId = String(childProcess.process_id)
  const childProcessName =
    subprocessConfig.childProcessName ?? childProcess.process_name ?? null

  const childWorkflowId =
    childProcess.workflow_id ??
    childProcess.workflow_public_id ??
    childProcess.process_workflow_id ??
    null

  const childWorkflowName = childProcess.workflow_name ?? childProcessName

  console.log('[createChildDocumentFromRow] iniciando =>', {
    accountId,
    childProcessId,
    childProcessName,
    childWorkflowId,
    relationGroupId,
    tableMetadataDefinitionId: tableRowContext.tableMetadataDefinitionId,
    tableName: tableRowContext.tableName,
    rowIndex: tableRowContext.rowIndex,
    row: tableRowContext.row,
    currentElementId: currentElementId ?? null,
    parentNextElementId: parentNextElementId ?? null,
  })

  if (!childWorkflowId) {
    console.error('[createChildDocumentFromRow] workflow não encontrado =>', {
      childProcessId,
      childProcess,
    })
    throw new Error(
      `Nenhum workflow encontrado para o processo filho ${childProcessId}.`,
    )
  }

  const elementConfigs = normalizeElementConfigs(childProcess.element_configs)
  const initialStep = pickFirstRunnableStepFromWorkflow(elementConfigs)

  console.log('[createChildDocumentFromRow] initialStep resolvido =>', {
    currentElementId: initialStep.currentElementId,
    currentStepName: initialStep.currentStepName,
    responsibleId: initialStep.responsibleId,
    allowedActions: initialStep.allowedActions,
  })

  const createdById = user?.id ?? parent.created_by_id ?? 'system'
  const createdByName =
    user?.name ?? user?.email ?? parent.created_by_name ?? 'Sistema'

  const childCode = await generateDocumentCode({
    client,
    accountId,
    processId: childProcessId,
  })

  const childTitle = buildChildTitle({
    childProcessName,
    parentCode: parent.code,
    parentTitle: parent.title,
    tableName: tableRowContext.tableName,
    row: tableRowContext.row,
    rowIndex: tableRowContext.rowIndex,
  })

  console.log('[createChildDocumentFromRow] criando document filho =>', {
    childCode,
    childTitle,
    childProcessId,
    childWorkflowId,
  })

  // ── Cria o documento lógico filho ─────────────────────────────────────────
  const documentResult = await client.query(
    `
    INSERT INTO documents (
      account_id,
      process_id,
      process_name,
      title,
      code,
      workflow_id,
      workflow_name,
      created_by_id,
      created_by_name,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()
    )
    RETURNING *
    `,
    [
      accountId,
      childProcessId,
      childProcessName,
      childTitle,
      childCode,
      String(childWorkflowId),
      childWorkflowName,
      createdById,
      createdByName,
    ],
  )

  const childDocument = documentResult.rows[0]

  console.log('[createChildDocumentFromRow] document filho criado =>', {
    childDocumentId: childDocument.id,
    childCode: childDocument.code,
  })

  // parentDocumentId = documents.id do pai
  // Obtido via alias base_document_id na query de getParentDocumentInstance
  // Usado em document_relations.parent_document_id (FK → documents.id)
  const parentDocumentId =
    parent.base_document_id ??
    parent.document_id ??
    parent.documentId ??
    null

  console.log('[createChildDocumentFromRow] parent ids resolvidos =>', {
    'parent.id (document_instances.id)': parent.id,
    'parentDocumentId (documents.id)': parentDocumentId,
  })

  // ── Cria a instância do documento filho ───────────────────────────────────
  // [FIX-1] parent_document_id → FK aponta para document_instances.id
  //         Usar parent.id, não parentDocumentId (documents.id)
  const instanceResult = await client.query(
    `
    INSERT INTO document_instances (
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
      updated_at,
      current_element_id,
      current_assigned_user_id,
      current_assigned_user_name,
      allowed_actions,
      task_actions,
      document_id
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,NOW(),NOW(),
      $18,$19,$20,$21::jsonb,$22::jsonb,$23
    )
    RETURNING *
    `,
    [
      accountId,                                    // $1
      childProcessId,                               // $2
      childProcessName,                             // $3
      childTitle,                                   // $4
      childCode,                                    // $5
      '00',                                         // $6  revision
      parent.id,                                    // $7  [FIX-1] FK → document_instances.id
      'in_progress',                                // $8  status
      String(childWorkflowId),                      // $9
      childWorkflowName,                            // $10
      initialStep.currentStepName,                  // $11
      initialStep.currentStepOrderIndex,            // $12
      initialStep.responsibleId,                    // $13
      initialStep.responsibleName,                  // $14
      createdById,                                  // $15
      createdByName,                                // $16
      null,                                         // $17  due_date
      initialStep.currentElementId,                 // $18
      initialStep.currentAssignedUserId,            // $19
      initialStep.currentAssignedUserName,          // $20
      JSON.stringify(initialStep.allowedActions),   // $21
      JSON.stringify(initialStep.taskActions),      // $22
      childDocument.id,                             // $23  document_id → FK → documents.id
    ],
  )

  const childInstance = instanceResult.rows[0]

  console.log('[createChildDocumentFromRow] instance filho criada =>', {
    childInstanceId: childInstance.id,
    status: childInstance.status,
    currentElementId: childInstance.current_element_id,
  })

  // ── Atualiza ponteiro current no documento lógico filho ───────────────────
  await client.query(
    `
    UPDATE documents
    SET current_instance_id = $1,
        updated_at = NOW()
    WHERE id::text = $2::text
    `,
    [childInstance.id, childDocument.id],
  )

  // ── Copia metadados do pai para o filho (se configurado) ──────────────────
  if (subprocessConfig.copyParentMetadata) {
    console.log('[createChildDocumentFromRow] copiando metadados do pai =>', {
      parentInstanceId: parent.id,
      childInstanceId: childInstance.id,
      excludeIds: subprocessConfig.sourceTableFieldIds ?? [],
    })

    await copyParentMetadataToChild({
      client,
      parentDocumentInstanceId: parent.id,
      childDocumentInstanceId: childInstance.id,
      accountId,
      childProcessId,
      excludeMetadataDefinitionIds: subprocessConfig.sourceTableFieldIds ?? [],
    })
  }

  // ── Insere os dados da linha como metadado no filho ───────────────────────
  await insertRowMetadataIntoChild({
    client,
    childDocumentInstanceId: childInstance.id,
    accountId,
    childProcessId,
    sourceTableMetadataDefinitionId: tableRowContext.tableMetadataDefinitionId,
    row: tableRowContext.row,
  })

  const {
    waitForCompletion,
    waitPolicy,
  } = normalizeSubprocessWaitConfig(subprocessConfig)

  // [FIX-3] status: chk_document_relations_status
  //   aceita: 'created' | 'waiting_child' | 'child_completed' | 'parent_continued' | 'cancelled' | 'error'
  const relationStatus: string =
    waitForCompletion ? 'waiting_child' : 'parent_continued'

  console.log('[createChildDocumentFromRow] inserindo em document_relations =>', {
    parentDocumentId,
    parentInstanceId: parent.id,
    childDocumentId: childDocument.id,
    childInstanceId: childInstance.id,
    relationGroupId,
    sourceTableMetadataDefinitionId: tableRowContext.tableMetadataDefinitionId,
    sourceRowIndex: tableRowContext.rowIndex,
    sourceRowKey: getRowKey(tableRowContext.row, tableRowContext.rowIndex),
    waitForCompletion,
    waitPolicy,
    relationStatus,
    parentWaitingElementId: currentElementId ?? parent.current_element_id ?? null,
    parentNextElementId: parentNextElementId ?? null,
  })

  // ── Registra o vínculo pai-filho em document_relations ────────────────────
  // [FIX-2] relation_type = 'subprocess' (único valor válido para este caso)
  // [FIX-3] status = $24 (parâmetro JS, não expressão dentro do SQL)
  // [FIX-4] wait_policy = $19 (mapeado para 'all_children' | 'any_child')
  const relationResult = await client.query(
    `
    INSERT INTO document_relations (
      account_id,
      relation_group_id,
      parent_document_id,
      parent_document_instance_id,
      child_document_id,
      child_document_instance_id,
      relation_type,
      source_table_metadata_definition_id,
      source_table_name,
      source_row_key,
      source_row_index,
      source_row_value,
      parent_process_id,
      parent_process_name,
      child_process_id,
      child_process_name,
      child_workflow_id,
      child_workflow_name,
      wait_for_completion,
      wait_policy,
      status,
      parent_waiting_element_id,
      parent_next_element_id,
      created_by_id,
      created_by_name,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      'subprocess',
      $7,
      $8,
      $9,
      $10,
      $11::jsonb,
      $12,
      $13,
      $14,
      $15,
      $16,
      $17,
      $18,
      $19,
      $24,
      $20,
      $21,
      $22,
      $23,
      NOW(),
      NOW()
    )
    RETURNING *
    `,
    [
      accountId,                                                   // $1
      relationGroupId,                                             // $2
      parentDocumentId,                                            // $3  documents.id do pai
      parent.id,                                                   // $4  document_instances.id do pai
      childDocument.id,                                            // $5  documents.id do filho
      childInstance.id,                                            // $6  document_instances.id do filho
      tableRowContext.tableMetadataDefinitionId,                   // $7
      tableRowContext.tableName,                                   // $8
      getRowKey(tableRowContext.row, tableRowContext.rowIndex),    // $9
      tableRowContext.rowIndex,                                    // $10
      JSON.stringify(tableRowContext.row),                         // $11
      parent.process_id,                                          // $12
      parent.process_name,                                        // $13
      childProcessId,                                             // $14
      childProcessName,                                           // $15
      String(childWorkflowId),                                    // $16
      childWorkflowName,                                          // $17
      waitForCompletion,                                          // $18  boolean
      waitPolicy,                                                 // $19  'all_children' | 'any_child'
      currentElementId ?? parent.current_element_id ?? null,     // $20  parent_waiting_element_id
      parentNextElementId ?? null,                                // $21  parent_next_element_id
      createdById,                                                // $22
      createdByName,                                              // $23
      relationStatus,                                             // $24  'waiting_child' | 'parent_continued'
    ],
  )

  const relation = relationResult.rows[0]

  console.log('[createChildDocumentFromRow] document_relations inserido =>', {
    relationId: relation.id,
    status: relation.status,
    waitPolicy: relation.wait_policy,
    waitForCompletion: relation.wait_for_completion,
    sourceRowIndex: relation.source_row_index,
  })

  return {
    childDocument,
    childInstance,
    relation,
  }
}


async function executeSubprocessSystemTask(
  params: ExecuteSubprocessSystemTaskParams,
) {
  const {
    parentDocumentInstanceId,
    currentElementId,
    parentNextElementId,
    systemTaskConfig,
    user,
  } = params

  if (systemTaskConfig.actionType !== 'create-subprocess') {
    return {
      executed: false,
      shouldStopParentFlow: false,
      shouldContinueParentFlow: true,
      reason: 'A tarefa de sistema não é create-subprocess.',
    }
  }

  const subprocessConfig = systemTaskConfig.subprocess

  if (!subprocessConfig) {
    throw new Error('Configuração de subprocesso não encontrada.')
  }

  const childProcessId = normalizeString(subprocessConfig.childProcessId)

  if (!childProcessId) {
    throw new Error('childProcessId é obrigatório para criar subprocesso.')
  }

  const sourceTableFieldIds = Array.isArray(subprocessConfig.sourceTableFieldIds)
    ? subprocessConfig.sourceTableFieldIds.filter(Boolean).map(String)
    : []

  if (sourceTableFieldIds.length === 0) {
    throw new Error(
      'sourceTableFieldIds é obrigatório para criar subprocesso a partir da tabela.',
    )
  }

  const {
    waitForCompletion,
    waitPolicy,
    frontendWaitPolicy,
  } = normalizeSubprocessWaitConfig(subprocessConfig)

  const client = await db.pool.connect()

  try {
    await client.query('BEGIN')

    const parent = await getParentDocumentInstance({
      client,
      parentDocumentInstanceId,
    })

    if (!parent) {
      throw new Error('Instância/documento pai não encontrado.')
    }

    const childProcess = await getChildProcessAndWorkflow({
      client,
      childProcessId,
    })

    if (!childProcess) {
      throw new Error(`Processo filho não encontrado: ${childProcessId}.`)
    }

    const tableValues = await getTableMetadataValues({
      client,
      parentDocumentInstanceId,
      sourceTableFieldIds,
    })

    if (tableValues.length === 0) {
      throw new Error(
        'Nenhum valor de tabela foi encontrado no documento pai para os metadados configurados.',
      )
    }

    const relationGroupId = randomUUID()
    const createdChildren: any[] = []

    console.log('[executeSubprocessSystemTask] configuração de espera =>', {
      parentDocumentInstanceId,
      currentElementId,
      parentNextElementId,
      waitForCompletion,
      waitPolicy,
      frontendWaitPolicy,
    })

    for (const tableValue of tableValues) {
      const rows = normalizeTableRows(tableValue.value)
      const tableName = tableValue.label ?? tableValue.name ?? 'Tabela'

      console.log('[executeSubprocessSystemTask] tabela encontrada =>', {
        metadataDefinitionId: tableValue.metadata_definition_id,
        tableName,
        totalRows: rows.length,
      })

      for (const [rowIndex, row] of rows.entries()) {
        const created = await createChildDocumentFromRow({
          client,
          parent,
          childProcess,
          relationGroupId,
          tableRowContext: {
            tableMetadataDefinitionId: String(tableValue.metadata_definition_id),
            tableName,
            row,
            rowIndex,
          },
          subprocessConfig: {
            ...subprocessConfig,
            waitForCompletion,
            waitPolicy: frontendWaitPolicy,
          },
          currentElementId,
          parentNextElementId,
          user,
        })

        createdChildren.push(created)
      }
    }

    if (createdChildren.length === 0) {
      throw new Error(
        'Nenhum documento filho foi criado. A tabela selecionada não possui linhas.',
      )
    }

    if (waitForCompletion) {
      await client.query(
        `
        UPDATE document_instances
        SET status = 'in_progress',
            current_step_name = $2,
            current_step_order_index = NULL,
            current_element_id = $3,
            current_assigned_user_id = NULL,
            current_assigned_user_name = NULL,
            responsible_id = NULL,
            responsible_name = NULL,
            allowed_actions = '[]'::jsonb,
            task_actions = '[]'::jsonb,
            due_date = NULL,
            updated_at = NOW()
        WHERE id::text = $1::text
        `,
        [
          parentDocumentInstanceId,
          waitPolicy === 'any_child'
            ? 'Aguardando qualquer subprocesso'
            : 'Aguardando todos os subprocessos',
          currentElementId ?? parent.current_element_id ?? null,
        ],
      )

      await client.query(
        `
        INSERT INTO audit_logs (
          document_instance_id,
          action,
          step_name,
          user_name,
          comment,
          metadata,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,NOW())
        `,
        [
          parentDocumentInstanceId,
          'SubprocessWaitingChildren',
          waitPolicy === 'any_child'
            ? 'Aguardando qualquer subprocesso'
            : 'Aguardando todos os subprocessos',
          user?.name ?? user?.email ?? user?.id ?? 'Sistema',
          waitPolicy === 'any_child'
            ? `Documento pai aguardando a conclusão de qualquer um dos ${createdChildren.length} filho(s).`
            : `Documento pai aguardando a conclusão de todos os ${createdChildren.length} filho(s).`,
          JSON.stringify({
            relationGroupId,
            waitForCompletion,
            waitPolicy,
            frontendWaitPolicy,
            currentElementId,
            parentNextElementId,
            totalChildrenCreated: createdChildren.length,
            childDocumentInstanceIds: createdChildren.map(
              (item) => item.childInstance.id,
            ),
          }),
        ],
      )
    }

    if (!waitForCompletion && parentNextElementId) {
      const nextStep = await resolveStepByElementId(
        String(parent.workflow_id),
        String(parentNextElementId),
      )

      if (!nextStep) {
        throw new Error(
          `Não foi possível resolver a próxima etapa do pai após o subprocesso: ${parentNextElementId}.`,
        )
      }

      await moveDocumentInstanceToResolvedStep({
        client,
        documentInstanceId: parentDocumentInstanceId,
        nextStep,
        userId: user?.id,
        userName: user?.name ?? user?.email ?? null,
        reason:
          'Documento pai avançado automaticamente porque o subprocesso está configurado como: Não aguardar.',
      })
    }

    await client.query('COMMIT')

    return {
      executed: true,
      relationGroupId,
      waitingForChildren: waitForCompletion,
      waitPolicy,
      frontendWaitPolicy,
      shouldStopParentFlow: waitForCompletion,
      shouldContinueParentFlow: !waitForCompletion,
      totalChildrenCreated: createdChildren.length,
      children: createdChildren.map((item) => ({
        childDocumentId: item.childDocument.id,
        childDocumentInstanceId: item.childInstance.id,
        relationId: item.relation.id,
        childCode: item.childDocument.code,
        childTitle: item.childDocument.title,
      })),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function insertRowMetadataIntoChild(params: {
  client: any
  childDocumentInstanceId: string
  accountId: string
  childProcessId: string
  sourceTableMetadataDefinitionId: string
  row: Record<string, any>
}) {
  const {
    client,
    childDocumentInstanceId,
    accountId,
    childProcessId,
    sourceTableMetadataDefinitionId,
    row,
  } = params

  await client.query(
    `
    INSERT INTO metadata_values (
      document_instance_id,
      metadata_definition_id,
      account_id,
      process_id,
      value,
      created_at,
      updated_at
    )
    VALUES (
      $1::uuid,
      $2,
      $3,
      $4,
      $5::jsonb,
      NOW(),
      NOW()
    )
    `,
    [
      childDocumentInstanceId,
      sourceTableMetadataDefinitionId,
      accountId,
      childProcessId,
      JSON.stringify(normalizeJsonObject(row)),
    ],
  )
}
// ─── Utils ────────────────────────────────────────────────────────────────────

function asArray<T = any>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

// function normalizeText(value: string | null | undefined): string {
//   return String(value ?? '')
//     .normalize('NFD')
//     .replace(/[\u0300-\u036f]/g, '')
//     .trim()
//     .toLowerCase()
// }

function actionAliases(value: string | null | undefined): string[] {
  const normalized = normalizeText(value)
  if (!normalized) return []
  const aliases = new Set<string>([normalized])
  if (normalized === 'approve' || normalized === 'aprovar') {
    aliases.add('approve'); aliases.add('aprovar')
  }
  if (['request-changes', 'request changes', 'solicitar revisao', 'solicitar revisão', 'devolver'].includes(normalized)) {
    aliases.add('request-changes'); aliases.add('request changes')
    aliases.add('solicitar revisao'); aliases.add('solicitar revisão'); aliases.add('devolver')
  }
  if (normalized === 'reject' || normalized === 'reprovar') { aliases.add('reject'); aliases.add('reprovar') }
  if (normalized === 'forward' || normalized === 'encaminhar') { aliases.add('forward'); aliases.add('encaminhar') }
  if (normalized === 'complete' || normalized === 'concluir') { aliases.add('complete'); aliases.add('concluir') }
  if (normalized === 'publish' || normalized === 'publicar') { aliases.add('publish'); aliases.add('publicar') }
  return Array.from(aliases)
}

// ─── BPMN Helpers ─────────────────────────────────────────────────────────────

function extractFlowTargets(bpmnXml: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!bpmnXml) return map
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const parsed = parser.parse(bpmnXml)
    const definitions = parsed['bpmn:definitions'] ?? parsed['definitions'] ?? {}
    const process =
      definitions['bpmn:process'] ?? definitions['process'] ??
      Object.values(definitions).find((v: any) => v?.['bpmn:sequenceFlow'] || v?.sequenceFlow) ?? {}
    const rawFlows = process['bpmn:sequenceFlow'] ?? process['sequenceFlow'] ?? []
    for (const flow of (Array.isArray(rawFlows) ? rawFlows : [rawFlows])) {
      const id = String(flow?.['@_id'] ?? '')
      const target = String(flow?.['@_targetRef'] ?? '')
      if (id && target) map.set(id, target)
    }
  } catch (err) { console.error('[extractFlowTargets] erro =>', err) }
  return map
}

function extractBpmnGraph(bpmnXml: string): Map<string, BpmnNodeInfo> {
  const graph = new Map<string, BpmnNodeInfo>()
  if (!bpmnXml) return graph
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const parsed = parser.parse(bpmnXml)
    const definitions = parsed['bpmn:definitions'] ?? parsed['definitions'] ?? {}
    const process =
      definitions['bpmn:process'] ?? definitions['process'] ??
      Object.values(definitions).find((v: any) => typeof v === 'object') ?? {}

    const registerNode = (rawNode: any, nodeType: BpmnNodeInfo['type']) => {
      const id = String(rawNode?.['@_id'] ?? '')
      if (!id) return
      const outgoing = asArray(rawNode?.['bpmn:outgoing'] ?? rawNode?.outgoing)
        .map((item: any) => typeof item === 'string' ? item : String(item?.['#text'] ?? item?.text ?? item ?? ''))
        .map((v) => String(v).trim()).filter(Boolean)
      const defaultFlowIdRaw = rawNode?.['@_default']
      const defaultFlowId = defaultFlowIdRaw != null ? String(defaultFlowIdRaw).trim() : null
      graph.set(id, { id, type: nodeType, outgoing, defaultFlowId })
    }

    for (const n of asArray(process['bpmn:startEvent'] ?? process['startEvent'])) registerNode(n, 'start')
    for (const n of asArray(process['bpmn:task'] ?? process['task'])) registerNode(n, 'activity')
    for (const n of asArray(process['bpmn:userTask'] ?? process['userTask'])) registerNode(n, 'activity')
    for (const n of asArray(process['bpmn:serviceTask'] ?? process['serviceTask'])) registerNode(n, 'activity')
    for (const n of asArray(process['bpmn:manualTask'] ?? process['manualTask'])) registerNode(n, 'activity')
    for (const n of asArray(process['bpmn:exclusiveGateway'] ?? process['exclusiveGateway'])) registerNode(n, 'gateway')
    for (const n of asArray(process['bpmn:parallelGateway'] ?? process['parallelGateway'])) registerNode(n, 'gateway')
    for (const n of asArray(process['bpmn:endEvent'] ?? process['endEvent'])) registerNode(n, 'end')
    for (const n of asArray(process['bpmn:intermediateThrowEvent'] ?? process['intermediateThrowEvent'])) registerNode(n, 'end')
    for (const n of asArray(process['bpmn:intermediateCatchEvent'] ?? process['intermediateCatchEvent'])) registerNode(n, 'passthrough')
    for (const n of asArray(process['bpmn:boundaryEvent'] ?? process['boundaryEvent'])) registerNode(n, 'passthrough')
  } catch (err) { console.error('[extractBpmnGraph] erro =>', err) }
  return graph
}

// ─── Workflow data ─────────────────────────────────────────────────────────────

async function fetchWorkflowData(workflowId: string) {
  const [
    wfResult,
    elementsResult,
    transitionsResult,
    elementConfigsResult,
    actionsResult,
    usersResult,
  ] = await Promise.all([
    db.query(
      `
      SELECT
        id,
        element_configs,
        bpmn_xml
      FROM workflows
      WHERE id::text = $1::text
      LIMIT 1
      `,
      [workflowId],
    ),

    db.query(
      `
      SELECT *
      FROM workflow_elements
      WHERE workflow_id::text = $1::text
      ORDER BY order_index ASC NULLS LAST, created_at ASC
      `,
      [workflowId],
    ),

    db.query(
      `
      SELECT *
      FROM workflow_transitions
      WHERE workflow_id::text = $1::text
      ORDER BY order_index ASC NULLS LAST, created_at ASC
      `,
      [workflowId],
    ),

    db.query(
      `
      SELECT
        c.*,
        e.element_type,
        e.element_kind,
        e.name AS element_name
      FROM workflow_element_configs c
      LEFT JOIN workflow_elements e
        ON e.id = c.workflow_element_id
      WHERE c.workflow_id::text = $1::text
      ORDER BY c.created_at ASC
      `,
      [workflowId],
    ),

    db.query(
      `
      SELECT *
      FROM workflow_activity_actions
      WHERE workflow_id::text = $1::text
        AND is_active = true
      ORDER BY element_id, order_index
      `,
      [workflowId],
    ),

    db.query(
      `
      SELECT *
      FROM workflow_activity_config_users
      WHERE workflow_id::text = $1::text
      ORDER BY element_id, order_index
      `,
      [workflowId],
    ),
  ])

  const workflowRow = wfResult.rows[0]
  const bpmnXml: string = workflowRow?.bpmn_xml ?? ''

  const legacyElementConfigs: any[] = Array.isArray(workflowRow?.element_configs)
    ? workflowRow.element_configs
    : []

  const elementConfigsFromTable = elementConfigsResult.rows.map((row: any) => ({
    id: row.id,
    workflowId: row.workflow_id,
    elementId: row.element_id,
    elementType: row.element_type ?? '',
    elementName: row.element_name ?? undefined,
    kind: row.config_type,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const configuredByElementId = new Map<string, any>()

  legacyElementConfigs.forEach((item: any) => {
    if (item?.elementId) {
      configuredByElementId.set(String(item.elementId), item)
    }
  })

  elementConfigsFromTable.forEach((item: any) => {
    if (item?.elementId) {
      configuredByElementId.set(String(item.elementId), item)
    }
  })

  const elementConfigs = elementsResult.rows.map((row: any) => {
    const configured = configuredByElementId.get(String(row.element_id))

    return {
      id: configured?.id ?? row.id,
      workflowId: row.workflow_id,
      elementId: row.element_id,
      elementType: row.element_type,
      elementName: configured?.elementName ?? row.name ?? undefined,
      kind: configured?.kind ?? row.element_kind,
      config: configured?.config ?? row.config ?? {},
      createdAt: configured?.createdAt ?? row.created_at,
      updatedAt: configured?.updatedAt ?? row.updated_at,
    }
  })

  for (const configured of configuredByElementId.values()) {
    const exists = elementConfigs.some(
      (item: any) => String(item.elementId) === String(configured.elementId),
    )

    if (!exists) {
      elementConfigs.push(configured)
    }
  }

  const workflowTransitions = transitionsResult.rows.map((row: any) => ({
    id: row.id,
    workflowId: row.workflow_id,
    sequenceFlowId: row.sequence_flow_id,
    sourceElementId: row.source_element_id,
    targetElementId: row.target_element_id,
    name: row.name,
    label: row.label,
    outcome: row.outcome,
    conditionType: row.condition_type,
    metadataFieldId: row.metadata_field_id,
    expectedValue: row.expected_value,
    expression: row.expression,
    isDefault: row.is_default,
    orderIndex: row.order_index,
    config: row.config ?? {},
  }))

  const flowTargets = extractFlowTargets(bpmnXml)
  const bpmnGraph = extractBpmnGraph(bpmnXml)

  workflowTransitions.forEach((transition: any) => {
    if (transition.sequenceFlowId && transition.targetElementId) {
      flowTargets.set(String(transition.sequenceFlowId), String(transition.targetElementId))
    }

    const sourceId = String(transition.sourceElementId ?? '')
    const flowId = String(transition.sequenceFlowId ?? '')

    if (sourceId && flowId) {
      const current = bpmnGraph.get(sourceId)

      if (current) {
        current.outgoing = Array.from(new Set([...(current.outgoing ?? []), flowId]))
      } else {
        bpmnGraph.set(sourceId, {
          id: sourceId,
          type: 'unknown',
          outgoing: [flowId],
        })
      }
    }
  })

  const actionsByElement = new Map<string, any[]>()

  for (const row of actionsResult.rows) {
    const key = String(row.element_id)
    const list = actionsByElement.get(key) ?? []
    list.push(row)
    actionsByElement.set(key, list)
  }

  const usersByElement = new Map<string, string[]>()

  for (const row of usersResult.rows) {
    const key = String(row.element_id)
    const list = usersByElement.get(key) ?? []
    list.push(String(row.user_id))
    usersByElement.set(key, list)
  }

  console.log('[fetchWorkflowData] dados carregados =>', {
    workflowId,
    elements: elementsResult.rows.length,
    transitions: workflowTransitions.length,
    elementConfigs: elementConfigs.length,
    actions: actionsResult.rows.length,
    users: usersResult.rows.length,
  })

  return {
    elementConfigs,
    workflowTransitions,
    bpmnXml,
    flowTargets,
    bpmnGraph,
    actionsByElement,
    usersByElement,
  }
}
function buildResolvedStep(
  elementId: string,
  elementConfigs: any[],
  actionsByElement: Map<string, any[]>,
  usersByElement: Map<string, string[]>,
  activityIndex: number,
): ResolvedStep | null {
  const elementConfig = elementConfigs.find((c: any) => String(c.elementId ?? '') === elementId)
  if (!elementConfig) return null
  const rawActions = actionsByElement.get(elementId) ?? []
  const responsibleUserIds = usersByElement.get(elementId) ?? []
  const config = elementConfig.config ?? {}
  const taskActions: TaskAction[] = rawActions.map((a: any) => ({
    id: String(a.id),
    label: String(a.action_label ?? a.action_name ?? a.outcome),
    outcome: String(a.outcome ?? a.action_key),
    color: String(a.button_color ?? '#1677ff'),
    requiresComment: Boolean(a.requires_comment),
    nextElementId: a.next_element_id ? String(a.next_element_id) : null,
  }))
  return {
    elementId,
    stepName: String(elementConfig.elementName ?? elementId),
    stepOrderIndex: typeof config.orderIndex === 'number' ? config.orderIndex : activityIndex,
    allowedActions: taskActions.map((a) => a.outcome),
    taskActions,
    responsibleUserIds,
    deadlineMode: typeof config.deadlineMode === 'string' ? config.deadlineMode : null,
    deadlineValue: config.deadlineValue !== undefined ? Number(config.deadlineValue) : null,
    finalStatus: null,
  }
}

function resolveGatewaySequenceFlowId(
  gatewayConfig: any,
  gatewayNode: BpmnNodeInfo | undefined,
  actionId: string,
  outcome: string,
  executedActionLabel?: string | null,
): string | null {
  const actionRoutes: any[] = Array.isArray(gatewayConfig?.config?.actionRoutes) ? gatewayConfig.config.actionRoutes : []
  const normalizedActionId = String(actionId ?? '').trim()
  const outcomeAliases = actionAliases(outcome)
  const labelAliases = actionAliases(executedActionLabel)
  const matchedRoute = actionRoutes.find((route: any) => {
    const routeActionId = String(route?.actionId ?? '').trim()
    const routeActionLabel = normalizeText(route?.actionLabel)
    if (routeActionId && normalizedActionId && routeActionId === normalizedActionId) return true
    if (routeActionLabel) {
      if (outcomeAliases.includes(routeActionLabel)) return true
      if (labelAliases.includes(routeActionLabel)) return true
    }
    return false
  })
  if (matchedRoute?.sequenceFlowId) return String(matchedRoute.sequenceFlowId)
  const defaultRoute = actionRoutes.find((route: any) => Boolean(route?.isDefault))
  if (defaultRoute?.sequenceFlowId) return String(defaultRoute.sequenceFlowId)
  if (gatewayNode?.defaultFlowId) return String(gatewayNode.defaultFlowId)
  return null
}

// ─── Status resolver ──────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['draft', 'in_progress', 'approved', 'rejected', 'published', 'archived', 'cancelled'])

function resolveFinalStatus(finalAction: string | null | undefined, outcome: string | null | undefined): string {
  const actionMap: Record<string, string> = {
    publish: 'published', publicar: 'published',
    archive: 'archived', arquivar: 'archived',
    approve: 'approved', aprovar: 'approved',
    reject: 'rejected', reprovar: 'rejected',
    cancel: 'cancelled', cancelar: 'cancelled',
    complete: 'approved', concluir: 'approved',
    'request-changes': 'in_progress', 'request_changes': 'in_progress',
    'solicitar revisao': 'in_progress', devolver: 'in_progress',
    forward: 'in_progress', encaminhar: 'in_progress',
  }
  if (finalAction && VALID_STATUSES.has(finalAction)) return finalAction
  const na = normalizeText(finalAction)
  const no = normalizeText(outcome)
  if (na && actionMap[na]) return actionMap[na]
  if (no && actionMap[no]) return actionMap[no]
  return 'approved'
}

// ─── Step resolvers ───────────────────────────────────────────────────────────

async function resolveInitialStep(workflowId: string): Promise<ResolvedStep | null> {
  const { elementConfigs, actionsByElement, usersByElement } = await fetchWorkflowData(workflowId)
  const activities = elementConfigs.filter((c: any) => c.kind === 'activity')
  if (!activities.length) return null
  const initialActivity = activities.find((c: any) => Boolean(c.config?.isInitial)) ?? activities[0]
  if (!initialActivity) return null
  return buildResolvedStep(String(initialActivity.elementId), elementConfigs, actionsByElement, usersByElement, 0)
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isAutomaticWorkflowKind(kind?: string | null) {
  return [
    'subprocess',
    'system-task',
    'notification',
    'message',
    'timer',
    'signal',
    'conditional',
  ].includes(String(kind ?? ''))
}

function findElementConfigById(elementConfigs: any[], elementId: string | null) {
  if (!elementId) return null

  return (
    elementConfigs.find(
      (item: any) => String(item.elementId ?? '') === String(elementId),
    ) ?? null
  )
}

function findTransitionFromElement(params: {
  transitions: any[]
  sourceElementId: string
  outcome?: string | null
  actionId?: string | null
}) {
  const { transitions, sourceElementId, outcome, actionId } = params

  const outgoing = transitions.filter(
    (transition) =>
      String(transition.sourceElementId ?? '') === String(sourceElementId),
  )

  if (outgoing.length === 0) return null

  const normalizedOutcome = normalizeText(outcome)
  const normalizedActionId = normalizeText(actionId)

  const byOutcome = outgoing.find((transition) => {
    const config = transition.config ?? {}

    return (
      normalizeText(transition.outcome) === normalizedOutcome ||
      normalizeText(transition.label) === normalizedOutcome ||
      normalizeText(transition.name) === normalizedOutcome ||
      normalizeText(config.outcome) === normalizedOutcome ||
      normalizeText(config.actionId) === normalizedActionId
    )
  })

  if (byOutcome) return byOutcome

  const byDefault = outgoing.find((transition) => transition.isDefault === true)

  if (byDefault) return byDefault

  if (outgoing.length === 1) return outgoing[0]

  return outgoing[0]
}

function getOutgoingTransitionTarget(params: {
  workflowTransitions: any[]
  sourceElementId: string
  outcome?: string | null
  actionId?: string | null
}) {
  const transition = findTransitionFromElement({
    transitions: params.workflowTransitions,
    sourceElementId: params.sourceElementId,
    outcome: params.outcome,
    actionId: params.actionId,
  })

  return transition?.targetElementId ? String(transition.targetElementId) : null
}

function resolveSystemTaskConfigFromElementConfig(elementConfig: any): SystemTaskConfig | null {
  if (!elementConfig) return null

  const config = elementConfig.config ?? {}

  if (config?.actionType) {
    return config as SystemTaskConfig
  }

  if (elementConfig.kind === 'subprocess') {
    return {
      actionType: 'create-subprocess',
      auditNote: config.auditNote,
      notificationTemplateIds: config.notificationTemplateIds ?? [],
      subprocess: config.subprocess ?? {
        childProcessId: config.childProcessId,
        childProcessName: config.childProcessName,
        waitForCompletion: config.waitForCompletion,
        copyParentMetadata: config.copyParentMetadata,
        copyParentAttachments: config.copyParentAttachments,
        sourceTableFieldIds: config.sourceTableFieldIds ?? config.sourceTableMetadataDefinitionIds ?? [],
      },
    }
  }

  return null
}



async function resolveNextStep(
  workflowId: string,
  currentElementId: string,
  outcome: string,
  actionId: string,
): Promise<ResolvedStep | null> {
  const {
    elementConfigs,
    workflowTransitions,
    flowTargets,
    bpmnGraph,
    actionsByElement,
    usersByElement,
  } = await fetchWorkflowData(workflowId)

  console.log('[resolveNextStep] início =>', {
    workflowId,
    currentElementId,
    outcome,
    actionId,
    elementConfigs: elementConfigs.length,
    workflowTransitions: workflowTransitions?.length ?? 0,
  })

  const activities = elementConfigs.filter((config: any) => {
    return String(config?.kind ?? '').toLowerCase() === 'activity'
  })

  const currentActions = actionsByElement.get(currentElementId) ?? []

  const executedAction = currentActions.find((action: any) => {
    const actionDbId = String(action?.id ?? '')
    const actionOutcome = normalizeText(action?.outcome ?? action?.action_key)
    const requestedOutcome = normalizeText(outcome)

    return actionDbId === String(actionId) || actionOutcome === requestedOutcome
  })

  const executedActionLabel = String(
    executedAction?.action_label ??
    executedAction?.action_name ??
    executedAction?.outcome ??
    outcome ??
    '',
  ).trim()

  let nextElementId: string | null = executedAction?.next_element_id
    ? String(executedAction.next_element_id)
    : null

  console.log('[resolveNextStep] ação executada =>', {
    foundExecutedAction: Boolean(executedAction),
    executedActionId: executedAction?.id ?? null,
    executedActionLabel,
    executedActionOutcome: executedAction?.outcome ?? null,
    nextElementIdFromAction: nextElementId,
  })

  /**
   * 1) Prioridade nova:
   * Se a action não tiver next_element_id, usa workflow_transitions.
   * Isso resolve casos onde a atividade aponta para subprocesso, system-task,
   * gateway, end event etc.
   */
  if (!nextElementId) {
    nextElementId = getOutgoingTransitionTarget({
      workflowTransitions,
      sourceElementId: currentElementId,
      outcome,
      actionId,
    })

    console.log('[resolveNextStep] nextElementId via workflow_transitions =>', {
      currentElementId,
      outcome,
      actionId,
      nextElementId,
    })
  }

  /**
   * 2) Compatibilidade com BPMN XML antigo:
   * Se ainda não achou, usa o grafo BPMN antigo.
   */
  if (!nextElementId) {
    const currentNode = bpmnGraph.get(currentElementId)

    if (currentNode?.outgoing?.length === 1) {
      const flowId = currentNode.outgoing[0]
      nextElementId = flowTargets.get(flowId) ?? null

      console.log('[resolveNextStep] nextElementId via BPMN outgoing único =>', {
        currentElementId,
        flowId,
        nextElementId,
      })
    }
  }

  /**
   * 3) Compatibilidade com ações ligadas a gateway:
   * Se a atividade atual aponta para um gateway, tentamos resolver a saída
   * do gateway com base na ação executada.
   */
  if (nextElementId) {
    const possibleGatewayConfig = findElementConfigById(elementConfigs, nextElementId)
    const possibleGatewayNode = bpmnGraph.get(nextElementId)

    const isGateway =
      String(possibleGatewayConfig?.kind ?? '').toLowerCase() === 'gateway' ||
      possibleGatewayNode?.type === 'gateway'

    if (isGateway) {
      const gatewayConfig = possibleGatewayConfig
      const gatewayNode = possibleGatewayNode

      const gatewayFlowId = resolveGatewaySequenceFlowId(
        gatewayConfig?.config ?? gatewayConfig,
        gatewayNode,
        actionId,
        outcome,
        executedActionLabel,
      )

      const gatewayTargetFromTransitions = getOutgoingTransitionTarget({
        workflowTransitions,
        sourceElementId: nextElementId,
        outcome,
        actionId,
      })

      const gatewayTargetFromBpmn = gatewayFlowId
        ? flowTargets.get(gatewayFlowId) ?? null
        : null

      const resolvedGatewayTarget =
        gatewayTargetFromTransitions ?? gatewayTargetFromBpmn ?? null

      console.log('[resolveNextStep] gateway resolvido =>', {
        gatewayElementId: nextElementId,
        gatewayFlowId,
        gatewayTargetFromTransitions,
        gatewayTargetFromBpmn,
        resolvedGatewayTarget,
      })

      nextElementId = resolvedGatewayTarget
    }
  }

  /**
   * 4) Se ainda não achou a próxima etapa, tenta fallback por activities antigas.
   * Este bloco mantém compatibilidade com fluxos antigos que ainda dependem
   * de ordem das activities.
   */
  if (!nextElementId && activities.length > 0) {
    const currentActivityIndex = activities.findIndex((item: any) => {
      return String(item?.elementId ?? '') === String(currentElementId)
    })

    if (currentActivityIndex >= 0) {
      const nextActivity = activities[currentActivityIndex + 1]

      if (nextActivity?.elementId) {
        nextElementId = String(nextActivity.elementId)

        console.log('[resolveNextStep] nextElementId via fallback de activities =>', {
          currentActivityIndex,
          nextElementId,
        })
      }
    }
  }

  if (!nextElementId) {
    console.warn('[resolveNextStep] não encontrou nextElementId =>', {
      workflowId,
      currentElementId,
      outcome,
      actionId,
    })

    return null
  }

  /**
   * 5) Resolve o config do próximo elemento.
   */
  let targetConfig = findElementConfigById(elementConfigs, nextElementId)

  if (!targetConfig) {
    console.warn('[resolveNextStep] targetConfig não encontrado =>', {
      nextElementId,
      availableElementIds: elementConfigs.map((item: any) => item.elementId),
    })

    return null
  }

  const targetKind = String(targetConfig.kind ?? '').toLowerCase()
  const targetElementType = String(targetConfig.elementType ?? '')

  console.log('[resolveNextStep] targetConfig encontrado =>', {
    nextElementId,
    targetKind,
    targetElementType,
    elementName: targetConfig.elementName,
  })

  /**
   * 6) Se o próximo elemento for End Event, encerra o fluxo.
   */
  if (targetKind === 'end') {
    const endConfig = normalizeJsonObject(targetConfig.config)
    const finalStatus = resolveFinalStatus(
      endConfig.finalAction as string | null | undefined,
      outcome,
    )

    console.log('[resolveNextStep] próximo elemento é END =>', {
      nextElementId,
      finalAction: endConfig.finalAction,
      finalStatus,
    })

    return {
      elementId: nextElementId,
      stepName:
        targetConfig.elementName ??
        endConfig.name ??
        endConfig.title ??
        'Fim',
      stepOrderIndex: -1,
      allowedActions: [],
      taskActions: [],
      responsibleUserIds: [],
      deadlineMode: null,
      deadlineValue: null,
      finalStatus,
      kind: targetKind,
      elementType: targetElementType,
    }
  }

  /**
   * 7) Se o próximo elemento for automático:
   * subprocess, system-task, notification, message, timer, signal, conditional.
   */
  if (isAutomaticWorkflowKind(targetKind)) {
    const automaticNextElementId = getOutgoingTransitionTarget({
      workflowTransitions,
      sourceElementId: nextElementId,
    })

    const systemTaskConfig = resolveSystemTaskConfigFromElementConfig(targetConfig)

    const isConditionalRevision =
      targetKind === 'conditional' &&
      targetConfig.config?.actionType === 'increment-revision'

    console.log('[resolveNextStep] próximo elemento automático =>', {
      nextElementId,
      targetKind,
      targetElementType,
      automaticNextElementId,
      systemTaskConfig,
      isConditionalRevision,
    })

    return {
      elementId: nextElementId,
      stepName:
        targetConfig.elementName ??
        targetConfig.config?.name ??
        targetConfig.config?.title ??
        (targetKind === 'subprocess'
          ? 'Subprocesso'
          : 'Tarefa automática'),
      stepOrderIndex: -1,
      allowedActions: [],
      taskActions: [],
      responsibleUserIds: [],
      deadlineMode: null,
      deadlineValue: null,
      finalStatus: null,
      kind: targetKind,
      elementType: targetElementType,
      isAutomatic: true,
      systemTaskConfig,
      nextElementIdAfterAutomatic: automaticNextElementId,
      shouldCreateRevision: isConditionalRevision,
      revisionConfig: isConditionalRevision
        ? {
          actionType: 'increment-revision',
          createNewInstance:
            targetConfig.config?.createNewInstance !== false,
          auditNote: targetConfig.config?.auditNote ?? null,
        }
        : null,
    }
  }

  /**
   * 8) Se o próximo elemento for atividade humana, monta a próxima task.
   */
  if (targetKind === 'activity') {
    const resolvedActivityStep = buildResolvedStep(
      nextElementId,
      elementConfigs,
      actionsByElement,
      usersByElement,
      activities.findIndex((item: any) => {
        return String(item?.elementId ?? '') === String(nextElementId)
      }),
    )

    if (!resolvedActivityStep) {
      console.warn('[resolveNextStep] falha ao montar activity step =>', {
        nextElementId,
      })

      return null
    }

    console.log('[resolveNextStep] próxima atividade humana =>', {
      nextElementId,
      stepName: resolvedActivityStep.stepName,
      responsibleUserIds: resolvedActivityStep.responsibleUserIds,
      actions: resolvedActivityStep.taskActions.length,
    })

    return {
      ...resolvedActivityStep,
      kind: targetKind,
      elementType: targetElementType,
    }
  }

  /**
   * 9) Se o próximo elemento for gateway, tenta atravessar automaticamente.
   * Isso cobre o caso de cair em gateway depois de uma tarefa automática.
   */
  if (targetKind === 'gateway') {
    const gatewayTarget = getOutgoingTransitionTarget({
      workflowTransitions,
      sourceElementId: nextElementId,
      outcome,
      actionId,
    })

    console.log('[resolveNextStep] gateway sem activity direta =>', {
      gatewayElementId: nextElementId,
      gatewayTarget,
    })

    if (!gatewayTarget) {
      return null
    }

    targetConfig = findElementConfigById(elementConfigs, gatewayTarget)

    if (!targetConfig) {
      return null
    }

    const gatewayTargetKind = String(targetConfig.kind ?? '').toLowerCase()

    if (gatewayTargetKind === 'activity') {
      const resolvedActivityStep = buildResolvedStep(
        gatewayTarget,
        elementConfigs,
        actionsByElement,
        usersByElement,
        activities.findIndex((item: any) => {
          return String(item?.elementId ?? '') === String(gatewayTarget)
        }),
      )

      return resolvedActivityStep
        ? {
          ...resolvedActivityStep,
          kind: gatewayTargetKind,
          elementType: targetConfig.elementType ?? null,
        }
        : null
    }

    if (gatewayTargetKind === 'end') {
      const endConfig = normalizeJsonObject(targetConfig.config)
      const finalStatus = resolveFinalStatus(
        endConfig.finalAction as string | null | undefined,
        outcome,
      )

      return {
        elementId: gatewayTarget,
        stepName:
          targetConfig.elementName ??
          endConfig.name ??
          endConfig.title ??
          'Fim',
        stepOrderIndex: -1,
        allowedActions: [],
        taskActions: [],
        responsibleUserIds: [],
        deadlineMode: null,
        deadlineValue: null,
        finalStatus,
        kind: gatewayTargetKind,
        elementType: targetConfig.elementType ?? null,
      }
    }

    if (isAutomaticWorkflowKind(gatewayTargetKind)) {
      const automaticNextElementId = getOutgoingTransitionTarget({
        workflowTransitions,
        sourceElementId: gatewayTarget,
      })

      const systemTaskConfig = resolveSystemTaskConfigFromElementConfig(targetConfig)

      return {
        elementId: gatewayTarget,
        stepName:
          targetConfig.elementName ??
          targetConfig.config?.name ??
          targetConfig.config?.title ??
          'Tarefa automática',
        stepOrderIndex: -1,
        allowedActions: [],
        taskActions: [],
        responsibleUserIds: [],
        deadlineMode: null,
        deadlineValue: null,
        finalStatus: null,
        kind: gatewayTargetKind,
        elementType: targetConfig.elementType ?? null,
        isAutomatic: true,
        systemTaskConfig,
        nextElementIdAfterAutomatic: automaticNextElementId,
      }
    }
  }

  console.warn('[resolveNextStep] tipo de elemento não tratado =>', {
    nextElementId,
    targetKind,
    targetElementType,
  })

  return null
}


async function resolveStepByElementId(
  workflowId: string,
  elementId: string,
): Promise<ResolvedStep | null> {
  const {
    elementConfigs,
    actionsByElement,
    usersByElement,
  } = await fetchWorkflowData(workflowId)

  const targetConfig = findElementConfigById(elementConfigs, elementId)

  if (!targetConfig) {
    console.warn('[resolveStepByElementId] targetConfig não encontrado =>', {
      workflowId,
      elementId,
      availableElementIds: elementConfigs.map((item: any) => item.elementId),
    })

    return null
  }

  const targetKind = String(targetConfig.kind ?? '').toLowerCase()
  const targetElementType = String(targetConfig.elementType ?? '')

  if (targetKind === 'end') {
    const endConfig = normalizeJsonObject(targetConfig.config)
    const finalStatus = resolveFinalStatus(
      endConfig.finalAction as string | null | undefined,
      'complete',
    )

    return {
      elementId,
      stepName:
        targetConfig.elementName ??
        endConfig.name ??
        endConfig.title ??
        'Fim',
      stepOrderIndex: -1,
      allowedActions: [],
      taskActions: [],
      responsibleUserIds: [],
      deadlineMode: null,
      deadlineValue: null,
      finalStatus,
      kind: targetKind,
      elementType: targetElementType,
    }
  }

  if (targetKind === 'activity') {
    const activities = elementConfigs.filter((config: any) => {
      return String(config?.kind ?? '').toLowerCase() === 'activity'
    })

    const resolvedActivityStep = buildResolvedStep(
      elementId,
      elementConfigs,
      actionsByElement,
      usersByElement,
      activities.findIndex((item: any) => {
        return String(item?.elementId ?? '') === String(elementId)
      }),
    )

    if (!resolvedActivityStep) {
      return null
    }

    return {
      ...resolvedActivityStep,
      kind: targetKind,
      elementType: targetElementType,
    }
  }

  if (isAutomaticWorkflowKind(targetKind)) {
    const systemTaskConfig = resolveSystemTaskConfigFromElementConfig(targetConfig)

    return {
      elementId,
      stepName:
        targetConfig.elementName ??
        targetConfig.config?.name ??
        targetConfig.config?.title ??
        'Tarefa automática',
      stepOrderIndex: -1,
      allowedActions: [],
      taskActions: [],
      responsibleUserIds: [],
      deadlineMode: null,
      deadlineValue: null,
      finalStatus: null,
      kind: targetKind,
      elementType: targetElementType,
      isAutomatic: true,
      systemTaskConfig,
      nextElementIdAfterAutomatic: null,
    }
  }

  console.warn('[resolveStepByElementId] tipo de elemento não tratado =>', {
    workflowId,
    elementId,
    targetKind,
    targetElementType,
  })

  return null
}

async function moveDocumentInstanceToResolvedStep(params: {
  client: QueryExecutor
  documentInstanceId: string
  nextStep: ResolvedStep
  userName?: string | null
  userId?: string | null
  reason?: string
}) {
  const {
    client,
    documentInstanceId,
    nextStep,
    userName,
    userId,
    reason,
  } = params

  const isFinal = !!nextStep.finalStatus

  const newStatus = isFinal ? nextStep.finalStatus : 'in_progress'
  const nextElementId = isFinal ? null : nextStep.elementId
  const nextStepName = isFinal ? null : nextStep.stepName
  const nextStepOrderIndex = isFinal ? null : nextStep.stepOrderIndex

  const nextAssignedUserId = isFinal
    ? null
    : nextStep.responsibleUserIds[0] ?? null

  const nextAssignedUserName =
    !isFinal && nextAssignedUserId
      ? await findUserNameById(nextAssignedUserId, client)
      : null

  let nextDueDate: string | null = null

  if (!isFinal && nextStep.deadlineMode && nextStep.deadlineValue) {
    const value = Number(nextStep.deadlineValue)

    if (Number.isFinite(value) && value > 0) {
      const due = new Date()

      if (nextStep.deadlineMode === 'hours') {
        due.setHours(due.getHours() + value)
      }

      if (nextStep.deadlineMode === 'days') {
        due.setDate(due.getDate() + value)
      }

      nextDueDate = due.toISOString()
    }
  }

  const updatedResult = await client.query(
    `
    UPDATE document_instances
    SET status = $2,
        current_step_name = $3,
        current_step_order_index = $4,
        current_element_id = $5,
        current_assigned_user_id = $6,
        current_assigned_user_name = $7,
        responsible_id = $8,
        responsible_name = $9,
        allowed_actions = $10::jsonb,
        task_actions = $11::jsonb,
        due_date = $12,
        updated_at = NOW()
    WHERE id::text = $1::text
    RETURNING *
    `,
    [
      documentInstanceId,
      newStatus,
      nextStepName,
      nextStepOrderIndex,
      nextElementId,
      nextAssignedUserId,
      nextAssignedUserName,
      nextAssignedUserId,
      nextAssignedUserName,
      JSON.stringify(isFinal ? [] : nextStep.allowedActions ?? []),
      JSON.stringify(isFinal ? [] : nextStep.taskActions ?? []),
      nextDueDate,
    ],
  )

  const updatedDocument = updatedResult.rows[0]

  await client.query(
    `
    INSERT INTO audit_logs (
      document_instance_id,
      action,
      step_name,
      user_name,
      comment,
      metadata,
      created_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    `,
    [
      documentInstanceId,
      isFinal ? 'ParentFlowFinished' : 'ParentFlowResumed',
      nextStepName,
      userName ?? userId ?? 'Sistema',
      reason ?? 'Documento pai avançado após subprocesso.',
      JSON.stringify({
        nextElementId,
        nextStepName,
        finalStatus: isFinal ? newStatus : null,
      }),
    ],
  )

  let nextTaskResult: any = {
    created: false,
    reason: null,
    task: null,
  }

  if (
    !isFinal &&
    updatedDocument?.current_element_id &&
    updatedDocument?.current_assigned_user_id
  ) {
    nextTaskResult = await createPendingTask(
      {
        documentInstanceId: updatedDocument.id,
        stepOrderIndex: updatedDocument.current_step_order_index ?? null,
        stepName: updatedDocument.current_step_name ?? null,
        elementId: updatedDocument.current_element_id,
        assignedUserId: updatedDocument.current_assigned_user_id,
        assignedUserName: updatedDocument.current_assigned_user_name ?? null,
        dueDate: nextDueDate,
        allowedActions: updatedDocument.allowed_actions ?? [],
        taskActions: updatedDocument.task_actions ?? [],
      },
      client,
    )
  }

  return {
    updatedDocument,
    nextTaskResult,
  }
}

async function resumeParentIfSubprocessPolicyAllows(params: {
  childDocumentInstanceId: string
  userId?: string | null
  userName?: string | null
}) {
  const { childDocumentInstanceId, userId, userName } = params

  const client = await db.pool.connect()

  try {
    await client.query('BEGIN')

    const relationsResult = await client.query(
      `
      SELECT
        dr.*,
        pdi.workflow_id AS parent_workflow_id,
        pdi.current_element_id AS parent_current_element_id,
        pdi.status AS parent_document_status
      FROM document_relations dr
      INNER JOIN document_instances pdi
        ON pdi.id = dr.parent_document_instance_id
      WHERE dr.child_document_instance_id::text = $1::text
        AND dr.relation_type = 'subprocess'
        AND dr.wait_for_completion = true
        AND dr.status = 'waiting_child'
      FOR UPDATE
      `,
      [childDocumentInstanceId],
    )

    if (relationsResult.rows.length === 0) {
      await client.query('COMMIT')

      return {
        resumed: false,
        reason: 'Nenhuma relação pendente encontrada para este filho.',
      }
    }

    const resumedParents: any[] = []

    for (const relation of relationsResult.rows) {
      const relationId = relation.id
      const relationGroupId = relation.relation_group_id
      const parentDocumentInstanceId = relation.parent_document_instance_id
      const parentNextElementId = relation.parent_next_element_id
      const parentWorkflowId = relation.parent_workflow_id
      const waitPolicy = String(relation.wait_policy ?? 'all_children')

      console.log('[resumeParentIfSubprocessPolicyAllows] avaliando relação =>', {
        childDocumentInstanceId,
        relationId,
        relationGroupId,
        parentDocumentInstanceId,
        parentNextElementId,
        parentWorkflowId,
        waitPolicy,
      })

      await client.query(
        `
        UPDATE document_relations
        SET status = 'child_completed',
            updated_at = NOW()
        WHERE id::text = $1::text
        `,
        [relationId],
      )

      let shouldResumeParent = false
      let resumeReason = ''

      if (waitPolicy === 'any_child') {
        shouldResumeParent = true
        resumeReason =
          'Documento pai retomado porque a política é: qualquer filho concluir.'
      }

      if (waitPolicy !== 'any_child') {
        const pendingResult = await client.query(
          `
          SELECT COUNT(*)::int AS total_pending
          FROM document_relations
          WHERE relation_group_id::text = $1::text
            AND parent_document_instance_id::text = $2::text
            AND wait_for_completion = true
            AND status = 'waiting_child'
          `,
          [relationGroupId, parentDocumentInstanceId],
        )

        const totalPending = Number(
          pendingResult.rows[0]?.total_pending ?? 0,
        )

        shouldResumeParent = totalPending === 0
        resumeReason =
          totalPending === 0
            ? 'Documento pai retomado porque todos os filhos foram concluídos.'
            : `Documento pai ainda aguardando ${totalPending} filho(s).`

        console.log('[resumeParentIfSubprocessPolicyAllows] política ALL =>', {
          relationGroupId,
          parentDocumentInstanceId,
          totalPending,
          shouldResumeParent,
        })
      }

      if (!shouldResumeParent) {
        await client.query(
          `
          INSERT INTO audit_logs (
            document_instance_id,
            action,
            step_name,
            user_name,
            comment,
            metadata,
            created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,NOW())
          `,
          [
            parentDocumentInstanceId,
            'SubprocessChildCompleted',
            'Aguardando subprocesso',
            userName ?? userId ?? 'Sistema',
            resumeReason,
            JSON.stringify({
              relationId,
              relationGroupId,
              childDocumentInstanceId,
              waitPolicy,
              resumed: false,
            }),
          ],
        )

        continue
      }

      if (!parentNextElementId) {
        throw new Error(
          `A relação ${relationId} não possui parent_next_element_id configurado.`,
        )
      }

      if (!parentWorkflowId) {
        throw new Error(
          `O documento pai ${parentDocumentInstanceId} não possui workflow_id.`,
        )
      }

      const nextStep = await resolveStepByElementId(
        String(parentWorkflowId),
        String(parentNextElementId),
      )

      if (!nextStep) {
        throw new Error(
          `Não foi possível resolver a próxima etapa do pai: ${parentNextElementId}.`,
        )
      }

      await moveDocumentInstanceToResolvedStep({
        client,
        documentInstanceId: parentDocumentInstanceId,
        nextStep,
        userId,
        userName,
        reason: resumeReason,
      })

      await client.query(
        `
        UPDATE document_relations
        SET status = 'parent_continued',
            updated_at = NOW()
        WHERE relation_group_id::text = $1::text
          AND parent_document_instance_id::text = $2::text
          AND status = 'waiting_child'
        `,
        [relationGroupId, parentDocumentInstanceId],
      )

      resumedParents.push({
        parentDocumentInstanceId,
        relationGroupId,
        waitPolicy,
        parentNextElementId,
        resumed: true,
      })
    }

    await client.query('COMMIT')

    return {
      resumed: resumedParents.length > 0,
      resumedParents,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}


// ─── Revision helpers ──────────────────────────────────────────────────────────

function incrementRevisionCode(current: string | null | undefined): string {
  const trimmed = String(current ?? '').trim()
  if (/^\d+$/.test(trimmed)) {
    const next = parseInt(trimmed, 10) + 1
    return String(next).padStart(Math.max(trimmed.length, 2), '0')
  }
  if (/^[A-Z]+$/i.test(trimmed)) {
    const chars = trimmed.toUpperCase().split('')
    let carry = true
    for (let i = chars.length - 1; i >= 0 && carry; i--) {
      if (chars[i] === 'Z') { chars[i] = 'A' } else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); carry = false }
    }
    if (carry) chars.unshift('A')
    return chars.join('')
  }
  return trimmed ? `${trimmed}-R1` : '01'
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function findUserNameById(userId: string | null | undefined, executor?: QueryExecutor): Promise<string | null> {
  if (!userId) return null
  const conn = executor ?? db
  const result = await conn.query(`SELECT name FROM users WHERE id = $1 LIMIT 1`, [userId])
  return result.rows[0]?.name ?? null
}

async function findDocumentById(documentId: string, executor?: QueryExecutor) {
  const conn = executor ?? db
  const result = await conn.query(
    `SELECT
       di.id,
       di.document_id AS "documentId",
       di.title,
       di.code,
       di.revision,
       di.parent_document_id AS "parentDocumentId",
       di.status,
       di.workflow_id AS "workflowId",
       di.workflow_name AS "workflowName",
       di.current_step_name AS "currentStepName",
       di.current_step_order_index AS "currentStepOrderIndex",
       di.current_element_id AS "currentElementId",
       di.current_assigned_user_id AS "currentAssignedUserId",
       di.current_assigned_user_name AS "currentAssignedUserName",
       di.responsible_id AS "responsibleId",
       di.responsible_name AS "responsibleName",
       di.allowed_actions AS "allowedActions",
       di.task_actions AS "taskActions",
       di.created_at AS "createdAt",
       di.updated_at AS "updatedAt"
     FROM document_instances di
     WHERE di.id = $1
     LIMIT 1`,
    [documentId],
  )
  return result.rows[0] ?? null
}

async function enrichInstance(instanceId: string, instance: any) {
  const documentId = instance.documentId ?? instance.document_id ?? null
  const instanceId2 = instance.id ?? instanceId

  const [tasksResult, auditLogsResult, metadataResult, revisionsResult] = await Promise.all([
    db.query(
      `SELECT id, document_instance_id, step_order_index, step_name, element_id,
              assigned_user_id, assigned_user_name, status, action_taken, comment,
              due_date, completed_at, allowed_actions, task_actions, created_at, updated_at
       FROM tasks WHERE document_instance_id = $1 ORDER BY created_at DESC`,
      [instanceId],
    ),
    db.query(
      `SELECT id, document_instance_id, action, step_name, user_name, comment, metadata, created_at
       FROM audit_logs WHERE document_instance_id = $1 ORDER BY created_at DESC`,
      [instanceId],
    ),
    db.query(
      `SELECT id, metadata_definition_id, account_id, process_id, value, created_at, updated_at
       FROM metadata_values WHERE document_instance_id = $1 ORDER BY created_at ASC`,
      [instanceId],
    ),
    documentId
      ? db.query(
        `SELECT id, code, revision, status, title, created_at, updated_at,
                created_by_name, responsible_name
         FROM document_instances
         WHERE document_id = $1
         ORDER BY revision ASC`,
        [documentId],
      )
      : Promise.resolve({ rows: [] }),
  ])

  const revisionHistory = revisionsResult.rows
    .filter((r: any) => String(r.id) !== String(instanceId2))
    .map((r: any) => ({
      id: String(r.id),
      code: r.code,
      revision: r.revision,
      status: r.status,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdByName: r.created_by_name ?? null,
      responsibleName: r.responsible_name ?? null,
    }))

  return {
    ...instance,
    currentInstanceId: instance.currentInstanceId ?? instance.current_instance_id ?? null,
    isCurrentRevision:
      String(instance.id ?? instanceId2) ===
      String(instance.currentInstanceId ?? instance.current_instance_id ?? ''),
    revisionHistory,
    tasks: tasksResult.rows.map((t: any) => ({
      id: t.id,
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
    metadataValues: metadataResult.rows.map((m: any) => ({
      id: m.id,
      metadataDefinitionId: m.metadata_definition_id,
      accountId: m.account_id,
      processId: m.process_id,
      value: m.value,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
  }
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /documents
 * Lista os documentos lógicos com dados da instância ativa.
 * Rápido: 1 linha por documento, JOIN com a instância current.
 */
async function findAll(req: Request, res: Response) {
  try {
    const conditions: string[] = []
    const values: any[] = []

    if (req.query.accountId) { values.push(req.query.accountId); conditions.push(`d.account_id = $${values.length}`) }
    if (req.query.processId) { values.push(req.query.processId); conditions.push(`d.process_id = $${values.length}`) }
    if (req.query.status) { values.push(req.query.status); conditions.push(`ci.status = $${values.length}`) }
    if (req.query.createdById) { values.push(req.query.createdById); conditions.push(`d.created_by_id = $${values.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await db.query(
      `SELECT
         d.id                          AS "documentId",
         d.account_id                  AS "accountId",
         d.process_id                  AS "processId",
         d.process_name                AS "processName",
         d.title,
         d.code,
         d.workflow_id                 AS "workflowId",
         d.workflow_name               AS "workflowName",
         d.created_by_id               AS "createdById",
         d.created_by_name             AS "createdByName",
         d.current_instance_id         AS "currentInstanceId",
         d.created_at                  AS "createdAt",
         d.updated_at                  AS "updatedAt",
         -- dados da instância ativa
         COALESCE(ci.id, d.current_instance_id)  AS "instanceId",
         COALESCE(ci.id, d.current_instance_id)  AS "id",
         ci.revision,
         ci.status,
         ci.current_step_name          AS "currentStepName",
         ci.current_step_order_index   AS "currentStepOrderIndex",
         ci.current_assigned_user_id   AS "currentAssignedUserId",
         ci.current_assigned_user_name AS "currentAssignedUserName",
         ci.responsible_id             AS "responsibleId",
         ci.responsible_name           AS "responsibleName",
         ci.due_date                   AS "dueDate",
         -- contagem de revisões
         (SELECT COUNT(*) FROM document_instances WHERE document_id = d.id) AS "revisionCount"
       FROM documents d
       LEFT JOIN document_instances ci ON ci.id = d.current_instance_id
       ${where}
       ORDER BY d.created_at DESC`,
      values,
    )

    return res.json(result.rows)
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar documentos.', error: error.message })
  }
}

/**
 * GET /documents/:id
 * Aceita tanto o documentId (lógico) quanto o instanceId (revisão específica).
 * Se receber documentId → abre a instância ativa (current_instance_id).
 * Se receber instanceId direto → abre essa revisão específica.
 */
async function findOne(req: Request, res: Response) {
  try {
    const { id } = req.params

    let instanceRow = await db.query(
      `SELECT di.*,
              di.id            AS id,
              di.document_id   AS "documentId",
              di.workflow_id   AS "workflowId",
              di.workflow_name AS "workflowName",
              di.created_by_id AS "createdById",
              di.created_by_name AS "createdByName",
              di.current_step_name AS "currentStepName",
              di.current_step_order_index AS "currentStepOrderIndex",
              di.current_element_id AS "currentElementId",
              di.current_assigned_user_id AS "currentAssignedUserId",
              di.current_assigned_user_name AS "currentAssignedUserName",
              di.responsible_id AS "responsibleId",
              di.responsible_name AS "responsibleName",
              di.parent_document_id AS "parentDocumentId",
              di.due_date AS "dueDate",
              di.created_at AS "createdAt",
              di.updated_at AS "updatedAt",
              d.current_instance_id AS "currentInstanceId"
       FROM document_instances di
       LEFT JOIN documents d ON d.id = di.document_id
       WHERE di.id = $1
       LIMIT 1`,
      [id],
    ).then((r) => r.rows[0] ?? null)

    if (!instanceRow) {
      const docRow = await db.query(
        `SELECT current_instance_id FROM documents WHERE id = $1 LIMIT 1`,
        [id],
      )

      if (!docRow.rows[0]) {
        return res.status(404).json({ success: false, message: `Documento ${id} não encontrado` })
      }

      const currentInstanceId = docRow.rows[0].current_instance_id

      if (!currentInstanceId) {
        return res.status(404).json({ success: false, message: `Documento ${id} não possui instância ativa` })
      }

      instanceRow = await db.query(
        `SELECT di.*,
                di.id            AS id,
                di.document_id   AS "documentId",
                di.workflow_id   AS "workflowId",
                di.workflow_name AS "workflowName",
                di.created_by_id AS "createdById",
                di.created_by_name AS "createdByName",
                di.current_step_name AS "currentStepName",
                di.current_step_order_index AS "currentStepOrderIndex",
                di.current_element_id AS "currentElementId",
                di.current_assigned_user_id AS "currentAssignedUserId",
                di.current_assigned_user_name AS "currentAssignedUserName",
                di.responsible_id AS "responsibleId",
                di.responsible_name AS "responsibleName",
                di.parent_document_id AS "parentDocumentId",
                di.due_date AS "dueDate",
                di.created_at AS "createdAt",
                di.updated_at AS "updatedAt",
                d.current_instance_id AS "currentInstanceId"
         FROM document_instances di
         LEFT JOIN documents d ON d.id = di.document_id
         WHERE di.id = $1
         LIMIT 1`,
        [currentInstanceId],
      ).then((r) => r.rows[0] ?? null)
    }

    if (!instanceRow) {
      return res.status(404).json({ success: false, message: `Instância não encontrada para ${id}` })
    }

    const enriched = await enrichInstance(String(instanceRow.id), instanceRow)
    return res.json(enriched)
  } catch (error: any) {
    console.error('[findOne] error =>', error)
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar documento.',
      error: error.message,
    })
  }
}

/**
 * GET /documents/:id/instances
 * Lista todas as revisões de um documento lógico.
 */
async function findInstances(req: Request, res: Response) {
  try {
    const { id } = req.params

    // Aceita documentId ou instanceId
    let documentId = id
    const docCheck = await db.query(`SELECT id FROM documents WHERE id = $1 LIMIT 1`, [id])
    if (!docCheck.rows[0]) {
      // Tenta via instance
      const instCheck = await db.query(`SELECT document_id FROM document_instances WHERE id = $1 LIMIT 1`, [id])
      if (!instCheck.rows[0]) return res.status(404).json({ success: false, message: 'Documento não encontrado' })
      documentId = String(instCheck.rows[0].document_id)
    }

    const result = await db.query(
      `SELECT
         id, document_id AS "documentId", code, revision, status, title,
         current_step_name AS "currentStepName",
         current_step_order_index AS "currentStepOrderIndex",
         current_assigned_user_id AS "currentAssignedUserId",
         current_assigned_user_name AS "currentAssignedUserName",
         responsible_id AS "responsibleId", responsible_name AS "responsibleName",
         created_by_id AS "createdById", created_by_name AS "createdByName",
         due_date AS "dueDate", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM document_instances
       WHERE document_id = $1
       ORDER BY revision DESC`,
      [documentId],
    )

    return res.json(result.rows)
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao listar instâncias.', error: error.message })
  }
}

async function findReferences(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'O id do documento é obrigatório.',
      })
    }

    const instanceResult = await db.query(
      `
      SELECT
        di.id AS instance_id,
        di.document_id,
        d.current_instance_id
      FROM document_instances di
      LEFT JOIN documents d
        ON d.id = di.document_id
      WHERE di.id::text = $1::text
         OR di.document_id::text = $1::text
      ORDER BY
        CASE
          WHEN di.id::text = $1::text THEN 0
          WHEN d.current_instance_id::text = di.id::text THEN 1
          ELSE 2
        END
      LIMIT 1
      `,
      [id],
    )

    const instanceRow = instanceResult.rows[0]

    if (!instanceRow) {
      return res.status(404).json({
        success: false,
        message: 'Documento/instância não encontrado.',
      })
    }

    const documentInstanceId = String(instanceRow.instance_id)
    const documentId = String(instanceRow.document_id)

    const result = await db.query(
      `
      SELECT
        dr.id,
        dr.account_id,
        dr.relation_group_id,
        dr.relation_type,
        dr.status AS relation_status,
        dr.wait_for_completion,
        dr.wait_policy,

        dr.parent_document_id,
        dr.parent_document_instance_id,
        dr.child_document_id,
        dr.child_document_instance_id,

        dr.parent_process_id,
        dr.parent_process_name,
        dr.child_process_id,
        dr.child_process_name,
        dr.child_workflow_id,
        dr.child_workflow_name,

        dr.source_table_metadata_definition_id,
        dr.source_table_name,
        dr.source_row_key,
        dr.source_row_index,
        dr.source_row_value,

        dr.parent_waiting_element_id,
        dr.parent_next_element_id,

        dr.created_by_id,
        dr.created_by_name,
        dr.created_at,
        dr.updated_at,

        pd.code AS parent_code,
        pd.title AS parent_title,
        pdi.status AS parent_status,
        pdi.revision AS parent_revision,
        pdi.current_step_name AS parent_current_step_name,

        cd.code AS child_code,
        cd.title AS child_title,
        cdi.status AS child_status,
        cdi.revision AS child_revision,
        cdi.current_step_name AS child_current_step_name,

        CASE
          WHEN dr.parent_document_instance_id::text = $1::text
            OR dr.parent_document_id::text = $2::text
          THEN 'child'
          ELSE 'parent'
        END AS direction
      FROM document_relations dr
      LEFT JOIN documents pd
        ON pd.id = dr.parent_document_id
      LEFT JOIN document_instances pdi
        ON pdi.id = dr.parent_document_instance_id
      LEFT JOIN documents cd
        ON cd.id = dr.child_document_id
      LEFT JOIN document_instances cdi
        ON cdi.id = dr.child_document_instance_id
      WHERE dr.parent_document_instance_id::text = $1::text
         OR dr.child_document_instance_id::text = $1::text
         OR dr.parent_document_id::text = $2::text
         OR dr.child_document_id::text = $2::text
      ORDER BY dr.created_at DESC
      `,
      [documentInstanceId, documentId],
    )

    const references = result.rows.map((row: any) => {
      const direction = row.direction

      const referencedDocumentId =
        direction === 'child'
          ? row.child_document_id
          : row.parent_document_id

      const referencedInstanceId =
        direction === 'child'
          ? row.child_document_instance_id
          : row.parent_document_instance_id

      const referencedCode =
        direction === 'child'
          ? row.child_code
          : row.parent_code

      const referencedTitle =
        direction === 'child'
          ? row.child_title
          : row.parent_title

      const referencedStatus =
        direction === 'child'
          ? row.child_status
          : row.parent_status

      const referencedRevision =
        direction === 'child'
          ? row.child_revision
          : row.parent_revision

      const referencedCurrentStepName =
        direction === 'child'
          ? row.child_current_step_name
          : row.parent_current_step_name

      return {
        id: row.id,
        relationGroupId: row.relation_group_id,
        relationType: row.relation_type,
        relationStatus: row.relation_status,
        direction,

        label: direction === 'child' ? 'Documento filho' : 'Documento pai',

        documentId: referencedDocumentId,
        documentInstanceId: referencedInstanceId,
        code: referencedCode,
        title: referencedTitle,
        status: referencedStatus,
        revision: referencedRevision,
        currentStepName: referencedCurrentStepName,

        parentDocumentId: row.parent_document_id,
        parentDocumentInstanceId: row.parent_document_instance_id,
        parentCode: row.parent_code,
        parentTitle: row.parent_title,
        parentStatus: row.parent_status,
        parentRevision: row.parent_revision,

        childDocumentId: row.child_document_id,
        childDocumentInstanceId: row.child_document_instance_id,
        childCode: row.child_code,
        childTitle: row.child_title,
        childStatus: row.child_status,
        childRevision: row.child_revision,

        parentProcessId: row.parent_process_id,
        parentProcessName: row.parent_process_name,
        childProcessId: row.child_process_id,
        childProcessName: row.child_process_name,
        childWorkflowId: row.child_workflow_id,
        childWorkflowName: row.child_workflow_name,

        sourceTableMetadataDefinitionId:
          row.source_table_metadata_definition_id,
        sourceTableName: row.source_table_name,
        sourceRowKey: row.source_row_key,
        sourceRowIndex: row.source_row_index,
        sourceRowValue: row.source_row_value,

        waitForCompletion: row.wait_for_completion,
        waitPolicy: row.wait_policy,

        parentWaitingElementId: row.parent_waiting_element_id,
        parentNextElementId: row.parent_next_element_id,

        createdById: row.created_by_id,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })

    return res.json(references)
  } catch (error: any) {
    console.error('[findReferences] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar referências do documento.',
      error: error?.message ?? 'Unknown error',
    })
  }
}


async function create(req: AuthenticatedRequest, res: Response) {
  const client = await db.pool.connect()
  try {
    const { accountId, processId, processName, title, workflowId, workflowName, createdById, createdByName, initialMetadataValues } = req.body

    await client.query('BEGIN')

    // Gera código sequencial por account
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS total FROM documents WHERE account_id = $1`, [accountId],
    )
    const code = `DOC-${new Date().getFullYear()}-${String((countResult.rows[0]?.total ?? 0) + 1).padStart(4, '0')}`

    // Cria o documento lógico
    const docResult = await client.query(
      `INSERT INTO documents (account_id, process_id, process_name, title, code, workflow_id, workflow_name, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [accountId, processId, processName ?? '', title, code, workflowId, workflowName ?? '', createdById, createdByName],
    )
    const doc = docResult.rows[0]

    // Resolve etapa inicial
    const initialStep = workflowId ? await resolveInitialStep(workflowId) : null
    const assignedUserId = initialStep?.responsibleUserIds[0] ?? createdById
    const assignedUserName = (await findUserNameById(assignedUserId, client)) ?? createdByName ?? null

    let dueDate: string | null = null
    if (initialStep?.deadlineMode && initialStep?.deadlineValue) {
      const value = Number(initialStep.deadlineValue)
      if (Number.isFinite(value) && value > 0) {
        const due = new Date()
        if (initialStep.deadlineMode === 'hours') due.setHours(due.getHours() + value)
        if (initialStep.deadlineMode === 'days') due.setDate(due.getDate() + value)
        dueDate = due.toISOString()
      }
    }

    // Cria a primeira instância (revisão 00)
    const instanceResult = await client.query(
      `INSERT INTO document_instances (
         document_id, account_id, process_id, process_name, title, code, revision,
         status, workflow_id, workflow_name, created_by_id, created_by_name,
         responsible_id, responsible_name, current_step_name, current_step_order_index,
         current_element_id, current_assigned_user_id, current_assigned_user_name,
         allowed_actions, task_actions, due_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22)
       RETURNING *`,
      [
        doc.id, accountId, processId, processName ?? '', title, code, '00',
        'draft', workflowId, workflowName ?? '', createdById, createdByName,
        assignedUserId, assignedUserName,
        initialStep?.stepName ?? null, initialStep?.stepOrderIndex ?? null,
        initialStep?.elementId ?? null, assignedUserId, assignedUserName,
        JSON.stringify(initialStep?.allowedActions ?? []),
        JSON.stringify(initialStep?.taskActions ?? []),
        dueDate,
      ],
    )
    const instance = instanceResult.rows[0]

    // Atualiza ponteiro current no documento lógico
    await client.query(
      `UPDATE documents SET current_instance_id = $1, updated_at = NOW() WHERE id = $2`,
      [instance.id, doc.id],
    )

    // Metadados iniciais
    if (initialMetadataValues && typeof initialMetadataValues === 'object') {
      for (const [metadataDefinitionId, value] of Object.entries(initialMetadataValues)) {
        if (value === null || value === undefined) continue
        await client.query(
          `INSERT INTO metadata_values (document_instance_id, metadata_definition_id, account_id, process_id, value)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (document_instance_id, metadata_definition_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [instance.id, metadataDefinitionId, accountId, processId, JSON.stringify(value)],
        )
      }
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [instance.id, 'DocumentCreated', initialStep?.stepName ?? null, createdByName ?? 'Sistema', 'Documento criado',
      JSON.stringify({ workflowId, workflowName, documentId: doc.id })],
    )

    // Task inicial
    if (initialStep?.elementId && assignedUserId) {
      await createPendingTask({
        documentInstanceId: instance.id,
        stepOrderIndex: initialStep.stepOrderIndex,
        stepName: initialStep.stepName,
        elementId: initialStep.elementId,
        assignedUserId, assignedUserName, dueDate,
        allowedActions: initialStep.allowedActions,
        taskActions: initialStep.taskActions,
      }, client)
    }

    await client.query('COMMIT')

    const enriched = await enrichInstance(instance.id, {
      ...instance,
      documentId: doc.id,
      currentStepName: instance.current_step_name,
      currentStepOrderIndex: instance.current_step_order_index,
      currentElementId: instance.current_element_id,
      currentAssignedUserId: instance.current_assigned_user_id,
      currentAssignedUserName: instance.current_assigned_user_name,
      workflowId: instance.workflow_id,
    })
    return res.status(201).json(enriched)
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('[create] error =>', error)
    return res.status(500).json({ success: false, message: 'Erro ao criar documento.', error: error.message })
  } finally {
    client.release()
  }
}

async function cancel(req: Request, res: Response) {
  try {
    const { id } = req.params
    const executorName = req.body?.executorName ?? req.body?.userName ?? 'Sistema'
    const updated = await db.query(
      `UPDATE document_instances SET status = 'cancelled', current_step_name = NULL,
       current_step_order_index = NULL, current_element_id = NULL,
       current_assigned_user_id = NULL, current_assigned_user_name = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id],
    )
    if (updated.rows.length === 0) return res.status(404).json({ success: false, message: `Documento ${id} não encontrado` })
    await db.query(
      `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, 'DocumentCancelled', null, executorName, 'Documento cancelado', JSON.stringify({ source: 'cancel' })],
    )
    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao cancelar documento.', error: error.message })
  }
}

async function cancelPatch(req: Request, res: Response) { return cancel(req, res) }

async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params
    const updated = await db.query(
      `UPDATE document_instances SET status = 'cancelled', current_step_name = NULL,
       current_step_order_index = NULL, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id],
    )
    if (updated.rows.length === 0) return res.status(404).json({ success: false, message: `Documento ${id} não encontrado` })
    await db.query(
      `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, 'DocumentCancelled', null, 'Sistema', 'Documento cancelado via delete lógico', JSON.stringify({ source: 'remove' })],
    )
    return res.status(204).send()
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao remover documento.', error: error.message })
  }
}




async function executeAction(req: AuthenticatedRequest, res: Response) {
  const client = await db.pool.connect()
  try {
    const userId = req.user?.id
    const userName = req.user?.name ?? null
    const instanceId = String(req.params.id ?? '').trim()
    const actionId = String(req.body?.actionId ?? '').trim()
    const outcome = String(req.body?.outcome ?? '').trim() || actionId
    const comment = String(req.body?.comment ?? '').trim()

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado.' })
    }
    if (!instanceId) {
      return res.status(400).json({ success: false, message: 'O id do documento é obrigatório.' })
    }
    if (!actionId) {
      return res.status(400).json({ success: false, message: 'A actionId é obrigatória.' })
    }

    await client.query('BEGIN')

    const document = await findDocumentById(instanceId, client)
    if (!document) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, message: 'Documento não encontrado.' })
    }
    if (!document.currentElementId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ success: false, message: 'Documento sem etapa atual configurada.' })
    }
    if (!document.currentAssignedUserId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ success: false, message: 'Documento sem responsável atual configurado.' })
    }
    if (document.currentAssignedUserId !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ success: false, message: 'Você não é o responsável atual deste documento.' })
    }

    const validationResult = await client.query(
      `SELECT id, outcome, action_key, next_element_id
       FROM workflow_activity_actions
       WHERE workflow_id = $1
         AND element_id = $2
         AND (id::text = $3 OR outcome = $3 OR action_key = $3 OR outcome = $4 OR action_key = $4)
         AND is_active = true
       LIMIT 1`,
      [document.workflowId, document.currentElementId, actionId, outcome],
    )

    if (validationResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        success: false,
        message: 'A ação informada não é permitida para a etapa atual.',
      })
    }

    const resolvedActionId = String(validationResult.rows[0].id)
    const resolvedOutcome = String(
      validationResult.rows[0].outcome ??
      validationResult.rows[0].action_key ??
      outcome,
    )

    const nextStep = await resolveNextStep(
      document.workflowId,
      document.currentElementId,
      resolvedOutcome,
      resolvedActionId,
    )

    if (!nextStep) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        success: false,
        message: 'Não foi possível determinar a próxima etapa do fluxo para a ação executada.',
      })
    }

    console.log('[executeAction] nextStep resolvido =>', {
      instanceId,
      currentElementId: document.currentElementId,
      resolvedOutcome,
      resolvedActionId,
      nextStepElementId: nextStep.elementId,
      nextStepKind: nextStep.kind,
      nextStepName: nextStep.stepName,
      isAutomatic: nextStep.isAutomatic ?? false,
      isFinal: !!nextStep.finalStatus,
      systemTaskActionType: nextStep.systemTaskConfig?.actionType ?? null,
      nextElementIdAfterAutomatic: nextStep.nextElementIdAfterAutomatic ?? null,
    })

    const isFinal = !!nextStep.finalStatus
    const newStatus = isFinal ? nextStep.finalStatus : null
    const nextElementId = isFinal ? null : (nextStep.elementId ?? null)
    const nextStepName = isFinal ? null : (nextStep.stepName ?? null)
    const nextStepOrderIndex = isFinal ? null : (nextStep.stepOrderIndex ?? null)
    const nextAssignedUserId = isFinal ? null : (nextStep.responsibleUserIds[0] ?? null)
    const nextAssignedUserName =
      !isFinal && nextAssignedUserId
        ? await findUserNameById(nextAssignedUserId, client)
        : null

    let nextDueDate: string | null = null
    if (!isFinal && nextStep.deadlineMode && nextStep.deadlineValue) {
      const value = Number(nextStep.deadlineValue)
      if (Number.isFinite(value) && value > 0) {
        const due = new Date()
        if (nextStep.deadlineMode === 'hours') due.setHours(due.getHours() + value)
        if (nextStep.deadlineMode === 'days') due.setDate(due.getDate() + value)
        nextDueDate = due.toISOString()
      }
    }

    const shouldCreateRevision =
      !isFinal &&
      nextStep.shouldCreateRevision === true &&
      nextStep.revisionConfig?.createNewInstance !== false

    // ── Histórico da ação ─────────────────────────────────────────────────
    await client.query(
      `INSERT INTO document_action_history (
         document_instance_id, step_name, step_order_index, element_id,
         action_id, outcome, comment,
         executed_by_user_id, executed_by_user_name,
         executed_at, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),NOW())`,
      [
        document.id,
        document.currentStepName ?? null,
        document.currentStepOrderIndex ?? null,
        document.currentElementId,
        resolvedActionId,
        resolvedOutcome,
        comment || null,
        userId,
        userName,
      ],
    )

    await completePendingTaskIfExists({
      documentInstanceId: document.id,
      elementId: document.currentElementId,
      assignedUserId: document.currentAssignedUserId,
      outcome: resolvedOutcome,
      comment: comment || undefined,
      actionId: resolvedActionId,
      executor: client,
    })

    await client.query(
      `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        document.id,
        resolvedOutcome,
        document.currentStepName ?? null,
        userName ?? userId,
        comment || null,
        JSON.stringify({
          actionId: resolvedActionId,
          fromElementId: document.currentElementId,
          toElementId: nextElementId,
          finalStatus: newStatus,
          shouldCreateRevision,
          isAutomatic: nextStep.isAutomatic ?? false,
        }),
      ],
    )

    let updatedDocument: any = null
    let revisionDocument: any = null
    let nextTaskResult: any = { created: false, reason: null, task: null }

    if (shouldCreateRevision) {
      // ── Ramo revisão ────────────────────────────────────────────────────
      const origResult = await client.query(
        `SELECT * FROM document_instances WHERE id = $1 LIMIT 1`,
        [document.id],
      )
      const orig = origResult.rows[0]
      if (!orig) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, message: 'Instância base não encontrada.' })
      }

      const newRevision = incrementRevisionCode(orig.revision)

      const newInstanceResult = await client.query(
        `INSERT INTO document_instances (
           document_id, account_id, process_id, process_name, title, code, revision,
           parent_document_id, status, workflow_id, workflow_name,
           current_step_name, current_step_order_index, current_element_id,
           current_assigned_user_id, current_assigned_user_name,
           responsible_id, responsible_name,
           created_by_id, created_by_name, due_date,
           allowed_actions, task_actions
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb)
         RETURNING *`,
        [
          orig.document_id, orig.account_id, orig.process_id, orig.process_name,
          orig.title, orig.code, newRevision,
          orig.id,
          'in_progress', orig.workflow_id, orig.workflow_name,
          nextStepName, nextStepOrderIndex, nextElementId,
          nextAssignedUserId, nextAssignedUserName,
          nextAssignedUserId, nextAssignedUserName,
          orig.created_by_id, orig.created_by_name, nextDueDate,
          JSON.stringify(nextStep.allowedActions ?? []),
          JSON.stringify(nextStep.taskActions ?? []),
        ],
      )
      revisionDocument = newInstanceResult.rows[0]

      await client.query(
        `UPDATE documents SET current_instance_id = $1, updated_at = NOW() WHERE id = $2`,
        [revisionDocument.id, orig.document_id],
      )

      const metaResult = await client.query(
        `SELECT metadata_definition_id, account_id, process_id, value
         FROM metadata_values WHERE document_instance_id = $1`,
        [document.id],
      )
      for (const meta of metaResult.rows) {
        await client.query(
          `INSERT INTO metadata_values (
             document_instance_id, metadata_definition_id, account_id, process_id, value
           )
           VALUES ($1,$2,$3,$4,$5::jsonb)
           ON CONFLICT (document_instance_id, metadata_definition_id) DO NOTHING`,
          [
            revisionDocument.id,
            meta.metadata_definition_id,
            meta.account_id,
            meta.process_id,
            JSON.stringify(meta.value),
          ],
        )
      }

      const updatedOrigResult = await client.query(
        `UPDATE document_instances SET
           current_step_name = NULL, current_step_order_index = NULL, current_element_id = NULL,
           current_assigned_user_id = NULL, current_assigned_user_name = NULL,
           responsible_id = NULL, responsible_name = NULL,
           allowed_actions = '[]'::jsonb, task_actions = '[]'::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [document.id],
      )
      updatedDocument = updatedOrigResult.rows[0]

      const auditNote =
        nextStep.revisionConfig?.auditNote ??
        `Revisão ${newRevision} criada a partir da revisão ${orig.revision ?? '00'}`

      await client.query(
        `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          revisionDocument.id, 'RevisionCreated', nextStepName ?? null,
          userName ?? userId, auditNote,
          JSON.stringify({
            sourceInstanceId: document.id,
            sourceRevision: orig.revision,
            newRevision,
            triggeredBy: resolvedOutcome,
          }),
        ],
      )
      await client.query(
        `INSERT INTO audit_logs (document_instance_id, action, step_name, user_name, comment, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          document.id, 'RevisionGenerated', document.currentStepName ?? null,
          userName ?? userId, `Gerou revisão ${newRevision}`,
          JSON.stringify({ newInstanceId: revisionDocument.id, newRevision }),
        ],
      )

      if (revisionDocument?.id && nextElementId && nextAssignedUserId) {
        nextTaskResult = await createPendingTask(
          {
            documentInstanceId: revisionDocument.id,
            stepOrderIndex: nextStepOrderIndex ?? null,
            stepName: nextStepName ?? null,
            elementId: nextElementId,
            assignedUserId: nextAssignedUserId,
            assignedUserName: nextAssignedUserName ?? null,
            dueDate: nextDueDate,
            allowedActions: nextStep.allowedActions ?? [],
            taskActions: nextStep.taskActions ?? [],
          },
          client,
        )
      }
    } else {
      // ── Ramo normal ──────────────────────────────────────────────────────
      const updatedResult = await client.query(
        `UPDATE document_instances SET
           status = COALESCE($2, status),
           current_step_name = $3,
           current_step_order_index = $4,
           current_element_id = $5,
           current_assigned_user_id = $6,
           current_assigned_user_name = $7,
           responsible_id = $8,
           responsible_name = $9,
           allowed_actions = $10::jsonb,
           task_actions = $11::jsonb,
           due_date = $12,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          document.id,
          newStatus,
          nextStepName,
          nextStepOrderIndex,
          nextElementId,
          nextAssignedUserId,
          nextAssignedUserName,
          nextAssignedUserId,
          nextAssignedUserName,
          JSON.stringify(nextStep.allowedActions ?? []),
          JSON.stringify(nextStep.taskActions ?? []),
          nextDueDate,
        ],
      )
      updatedDocument = updatedResult.rows[0]

      if (
        !isFinal &&
        updatedDocument?.current_element_id &&
        updatedDocument?.current_assigned_user_id
      ) {
        nextTaskResult = await createPendingTask(
          {
            documentInstanceId: updatedDocument.id,
            stepOrderIndex: updatedDocument.current_step_order_index ?? null,
            stepName: updatedDocument.current_step_name ?? null,
            elementId: updatedDocument.current_element_id,
            assignedUserId: updatedDocument.current_assigned_user_id,
            assignedUserName: updatedDocument.current_assigned_user_name ?? null,
            dueDate: nextDueDate,
            allowedActions: updatedDocument.allowed_actions ?? [],
            taskActions: updatedDocument.task_actions ?? [],
          },
          client,
        )
      }
    }

    await client.query('COMMIT')

    // ── [FIX-5] Execução automática de subprocess pós-COMMIT ─────────────────
    //
    // Após o COMMIT (estado persistido no banco), verifica se o próximo
    // elemento é um subprocess automático. Se sim, executa imediatamente.
    //
    // Condição: nextStep.isAutomatic === true
    //           && (kind === 'subprocess' || actionType === 'create-subprocess')

    let subprocessResult: any = null

    const isSubprocessAutomatic =
      nextStep.isAutomatic === true &&
      (nextStep.kind === 'subprocess' ||
        (nextStep.kind === 'system-task' &&
          nextStep.systemTaskConfig?.actionType === 'create-subprocess'))

    console.log('[executeAction] pós-commit — verificando subprocess automático =>', {
      instanceId,
      nextStepKind: nextStep.kind,
      nextStepElementId: nextStep.elementId,
      isAutomatic: nextStep.isAutomatic ?? false,
      isSubprocessAutomatic,
      systemTaskActionType: nextStep.systemTaskConfig?.actionType ?? null,
      childProcessId: nextStep.systemTaskConfig?.subprocess?.childProcessId ?? null,
      sourceTableFieldIds: nextStep.systemTaskConfig?.subprocess?.sourceTableFieldIds ?? [],
      nextElementIdAfterAutomatic: nextStep.nextElementIdAfterAutomatic ?? null,
    })

    if (isSubprocessAutomatic && nextStep.systemTaskConfig) {
      const targetInstanceId = shouldCreateRevision
        ? (revisionDocument?.id ?? document.id)
        : (updatedDocument?.id ?? document.id)

      console.log('[executeAction] chamando executeSubprocessSystemTask =>', {
        targetInstanceId,
        subprocessElementId: nextStep.elementId,
        parentNextElementId: nextStep.nextElementIdAfterAutomatic ?? null,
        waitForCompletion: nextStep.systemTaskConfig?.subprocess?.waitForCompletion ?? true,
        sourceTableFieldIds: nextStep.systemTaskConfig?.subprocess?.sourceTableFieldIds ?? [],
        childProcessId: nextStep.systemTaskConfig?.subprocess?.childProcessId ?? null,
      })

      try {
        subprocessResult = await executeSubprocessSystemTask({
          parentDocumentInstanceId: targetInstanceId,
          currentElementId: nextStep.elementId ?? null,
          parentNextElementId: nextStep.nextElementIdAfterAutomatic ?? null,
          systemTaskConfig: nextStep.systemTaskConfig,
          user: {
            id: userId,
            name: userName ?? undefined,
          },
        })

        console.log('[executeAction] executeSubprocessSystemTask SUCESSO =>', {
          targetInstanceId,
          executed: subprocessResult.executed,
          relationGroupId: subprocessResult.relationGroupId,
          waitingForChildren: subprocessResult.waitingForChildren,
          totalChildrenCreated: subprocessResult.totalChildrenCreated,
          children: subprocessResult.children?.map((c: any) => ({
            childDocumentId: c.childDocumentId,
            childDocumentInstanceId: c.childDocumentInstanceId,
            childCode: c.childCode,
            childTitle: c.childTitle,
            relationId: c.relationId,
          })),
        })

      } catch (subprocessError: any) {
        // COMMIT já foi feito. Registra o erro sem reverter o progresso.
        console.error('[executeAction] ERRO em executeSubprocessSystemTask =>', {
          targetInstanceId,
          subprocessElementId: nextStep.elementId,
          childProcessId: nextStep.systemTaskConfig?.subprocess?.childProcessId ?? null,
          sourceTableFieldIds: nextStep.systemTaskConfig?.subprocess?.sourceTableFieldIds ?? [],
          errorMessage: subprocessError?.message ?? null,
          stack: subprocessError?.stack ?? null,
        })

        try {
          await db.query(
            `INSERT INTO audit_logs (
               document_instance_id, action, step_name, user_name, comment, metadata
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              targetInstanceId,
              'SubprocessExecutionFailed',
              nextStep.stepName ?? 'Subprocesso',
              userName ?? userId,
              `Falha ao criar documentos filhos: ${subprocessError?.message ?? 'Erro desconhecido'}`,
              JSON.stringify({
                elementId: nextStep.elementId,
                childProcessId: nextStep.systemTaskConfig?.subprocess?.childProcessId ?? null,
                sourceTableFieldIds: nextStep.systemTaskConfig?.subprocess?.sourceTableFieldIds ?? [],
                errorMessage: subprocessError?.message ?? null,
              }),
            ],
          )
        } catch (auditError) {
          console.error('[executeAction] falha ao gravar audit_log do erro de subprocess =>', auditError)
        }

        // HTTP 207: ação principal ok, subprocess com erro
        return res.status(207).json({
          success: false,
          message: `Ação executada, mas houve erro ao criar os documentos filhos: ${subprocessError?.message ?? 'Erro desconhecido'}`,
          document: updatedDocument,
          revisionCreated: !!revisionDocument,
          nextTaskCreated: nextTaskResult.created,
          nextTask: nextTaskResult.task,
          subprocessError: subprocessError?.message ?? null,
        })
      }
    }

    let parentResumeResult: any = null

    const finishedStatusToCheck =
      revisionDocument?.status ??
      updatedDocument?.status ??
      newStatus ??
      null

    const finishedInstanceId =
      revisionDocument?.id ??
      updatedDocument?.id ??
      document.id

    if (isFinishedDocumentStatus(finishedStatusToCheck)) {
      try {
        parentResumeResult = await resumeParentIfSubprocessPolicyAllows({
          childDocumentInstanceId: finishedInstanceId,
          userId,
          userName,
        })

        console.log('[executeAction] verificação de retomada do pai =>', {
          childDocumentInstanceId: finishedInstanceId,
          finishedStatusToCheck,
          parentResumeResult,
        })
      } catch (resumeError: any) {
        console.error('[executeAction] erro ao tentar retomar documento pai =>', {
          childDocumentInstanceId: finishedInstanceId,
          finishedStatusToCheck,
          errorMessage: resumeError?.message ?? null,
          stack: resumeError?.stack ?? null,
        })
      }
    }

    return res.status(200).json({
      success: true,
      message: revisionDocument
        ? `Revisão ${revisionDocument.revision} criada com sucesso.`
        : subprocessResult?.executed
          ? `Ação executada. ${subprocessResult.totalChildrenCreated} documento(s) filho(s) criado(s).`
          : 'Ação executada com sucesso.',
      document: updatedDocument,
      revisionCreated: !!revisionDocument,
      revisionDocument: revisionDocument
        ? {
          id: revisionDocument.id,
          code: revisionDocument.code,
          revision: revisionDocument.revision,
          status: revisionDocument.status,
          currentStepName: revisionDocument.current_step_name,
          currentElementId: revisionDocument.current_element_id,
        }
        : null,
      nextTaskCreated: nextTaskResult.created,
      nextTask: nextTaskResult.task,
      subprocessExecuted: subprocessResult?.executed ?? false,
      subprocessResult: subprocessResult
        ? {
          relationGroupId: subprocessResult.relationGroupId,
          waitingForChildren: subprocessResult.waitingForChildren,
          waitPolicy: subprocessResult.waitPolicy,
          frontendWaitPolicy: subprocessResult.frontendWaitPolicy,
          totalChildrenCreated: subprocessResult.totalChildrenCreated,
          children: subprocessResult.children ?? [],
        }
        : null,
      parentResumeResult,
    })
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('[executeAction] error =>', error)
    return res.status(500).json({
      success: false,
      message: 'Erro ao executar ação do documento.',
      error: error?.message ?? 'Unknown error',
    })
  } finally {
    client.release()
  }
}

export default {
  findAll,
  findOne,
  findInstances,
  findReferences,
  create,
  cancel,
  cancelPatch,
  remove,
  executeAction,
}