import { Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../config/database'
import { AuthenticatedRequest } from '../middleware/authMiddleware'

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowActivityConfigPayload = {
  workflowId?: string
  elementId: string
  elementName?: string
  activityType?: string
  assignmentMode?: string
  deadlineMode?: string
  deadlineValue?: number | null
  deadlineFixedAt?: string | null
  instructions?: string
  helpText?: string
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  iconName?: string
  allowApprove?: boolean
  allowReject?: boolean
  allowRequestChanges?: boolean
  allowForward?: boolean
  allowComment?: boolean
  allowAttachment?: boolean
  notifyOnEnter?: boolean
  notifyOnExit?: boolean
  linkedWorkflowId?: string | null
  responsibleUserIds?: string[]
  responsibleRoleIds?: string[]
  responsibleGroupIds?: string[]
  responsibleAreaIds?: string[]
  responsiblePositionIds?: string[]
  responsibleDisciplineIds?: string[]
}

type WorkflowActivityActionPayload = {
  workflowId?: string
  elementId: string
  actionKey: string
  actionName: string
  actionLabel: string
  description?: string
  outcome?: string
  buttonColor?: string
  textColor?: string
  iconName?: string
  nextElementId?: string | null
  orderIndex?: number
  isDefault?: boolean
  isActive?: boolean
  requiresComment?: boolean
  requiresAttachment?: boolean
  confirmationMessage?: string
}

type WorkflowActivityMetadataPayload = {
  workflowId?: string
  elementId: string
  elementName?: string
  metadataDefinitionId: string
  isRequired?: boolean
  isReadOnly?: boolean
  orderIndex?: number
}

type WorkflowElementPayload = {
  elementId: string
  elementType: string
  elementKind: string
  name?: string | null
  description?: string | null
  orderIndex?: number | null
  isStart?: boolean
  isEnd?: boolean
  isExecutable?: boolean
  config?: unknown
}

type WorkflowTransitionPayload = {
  sequenceFlowId: string
  sourceElementId: string
  targetElementId: string
  name?: string | null
  label?: string | null
  outcome?: string | null
  conditionType?: string
  metadataFieldId?: string | null
  expectedValue?: string | null
  expression?: string | null
  isDefault?: boolean
  orderIndex?: number | null
  config?: unknown
}

type SaveWorkflowBody = {
  id?: string
  name: string
  description?: string
  version?: string
  status?: string
  documentTypeId?: string
  documentTypeName?: string
  processId?: string | null
  processName?: string | null
  environmentId?: string | null
  environmentName?: string | null
  scopeLevel?: string
  tenantId?: string
  accountName?: string
  bpmnXml?: string
  stepsCount?: number
  permissions?: unknown
  elementConfigs?: any[]
  snapshots?: unknown[]
  publishedAt?: string | null

  elements?: WorkflowElementPayload[]
  transitions?: WorkflowTransitionPayload[]

  activityConfigs?: WorkflowActivityConfigPayload[]
  activityActions?: WorkflowActivityActionPayload[]
  activityMetadata?: WorkflowActivityMetadataPayload[]
}

// ─── BPMN XML Parser ──────────────────────────────────────────────────────────

/**
 * Minimal regex-based BPMN XML parser.
 * Extracts elements (tasks, gateways, events, subprocesses) and
 * sequenceFlows from a BPMN 2.0 XML string without external dependencies.
 */
function parseBpmnXml(bpmnXml: string): {
  elements: WorkflowElementPayload[]
  transitions: WorkflowTransitionPayload[]
} {
  if (!bpmnXml?.trim()) return { elements: [], transitions: [] }

  const elements: WorkflowElementPayload[] = []
  const transitions: WorkflowTransitionPayload[] = []

  // ── Element type → kind mapping ──────────────────────────────────────────
  const kindMap: Record<string, { elementType: string; elementKind: string; isExecutable?: boolean; isStart?: boolean; isEnd?: boolean }> = {
    startEvent:               { elementType: 'event',   elementKind: 'start',         isStart: true,  isExecutable: false },
    endEvent:                 { elementType: 'event',   elementKind: 'end',           isEnd: true,    isExecutable: false },
    intermediateThrowEvent:   { elementType: 'event',   elementKind: 'message',       isExecutable: false },
    intermediateCatchEvent:   { elementType: 'event',   elementKind: 'message',       isExecutable: false },
    boundaryEvent:            { elementType: 'event',   elementKind: 'message',       isExecutable: false },
    task:                     { elementType: 'task',    elementKind: 'activity',      isExecutable: true },
    userTask:                 { elementType: 'task',    elementKind: 'activity',      isExecutable: true },
    serviceTask:              { elementType: 'task',    elementKind: 'system-task',   isExecutable: true },
    scriptTask:               { elementType: 'task',    elementKind: 'system-task',   isExecutable: true },
    sendTask:                 { elementType: 'task',    elementKind: 'notification',  isExecutable: true },
    receiveTask:              { elementType: 'task',    elementKind: 'message',       isExecutable: true },
    manualTask:               { elementType: 'task',    elementKind: 'activity',      isExecutable: true },
    businessRuleTask:         { elementType: 'task',    elementKind: 'system-task',   isExecutable: true },
    callActivity:             { elementType: 'task',    elementKind: 'subprocess',    isExecutable: true },
    subProcess:               { elementType: 'task',    elementKind: 'subprocess',    isExecutable: true },
    exclusiveGateway:         { elementType: 'gateway', elementKind: 'conditional',   isExecutable: false },
    inclusiveGateway:         { elementType: 'gateway', elementKind: 'conditional',   isExecutable: false },
    parallelGateway:          { elementType: 'gateway', elementKind: 'conditional',   isExecutable: false },
    eventBasedGateway:        { elementType: 'gateway', elementKind: 'conditional',   isExecutable: false },
    complexGateway:           { elementType: 'gateway', elementKind: 'conditional',   isExecutable: false },
  }

  // ── Parse elements ────────────────────────────────────────────────────────
  // Matches self-closing and open tags for known BPMN element types
  // Handles both bpmn: and bpmn2: namespaces, and no-namespace tags
  let elementIndex = 0

  for (const [tagName, meta] of Object.entries(kindMap)) {
    // Regex matches: <[ns:]tagName id="..." name="..." .../> or <[ns:]tagName id="..." ...>
    const tagRegex = new RegExp(
      `<(?:bpmn2?:)?${tagName}\\b([^>]*)(?:/>|>)`,
      'gi',
    )

    let match: RegExpExecArray | null
    while ((match = tagRegex.exec(bpmnXml)) !== null) {
      const attrs = match[1] ?? ''

      const idMatch = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs)
      const nameMatch = /\bname\s*=\s*["']([^"']+)["']/.exec(attrs)

      const elementId = idMatch?.[1]?.trim()
      if (!elementId) continue

      elements.push({
        elementId,
        elementType: meta.elementType,
        elementKind: meta.elementKind,
        name: nameMatch?.[1]?.trim() ?? null,
        description: null,
        orderIndex: elementIndex++,
        isStart: meta.isStart ?? false,
        isEnd: meta.isEnd ?? false,
        isExecutable: meta.isExecutable ?? false,
        config: {},
      })
    }
  }

  // ── Parse sequenceFlows (transitions) ─────────────────────────────────────
  // NOTE: We match against the full tag string (flowMatch[0]) instead of
  // the captured attribute group, because [^>]* stops before the trailing
  // slash in self-closing tags like <bpmn:sequenceFlow ... />, which can
  // truncate the last attribute value (e.g. targetRef="X" /).
  const flowRegex = /<(?:bpmn2?:)?sequenceFlow\b((?:[^>]|\/(?!>))*)\/?>(?:[\s\S]*?<\/(?:bpmn2?:)?sequenceFlow>)?/gi
  let flowIndex = 0
  let flowMatch: RegExpExecArray | null

  while ((flowMatch = flowRegex.exec(bpmnXml)) !== null) {
    const fullTag = flowMatch[0]  // use full tag so attributes are never truncated

    const idMatch      = /\bid\s*=\s*["']([^"']+)["']/.exec(fullTag)
    const nameMatch    = /\bname\s*=\s*["']([^"']+)["']/.exec(fullTag)
    const sourceMatch  = /\bsourceRef\s*=\s*["']([^"']+)["']/.exec(fullTag)
    const targetMatch  = /\btargetRef\s*=\s*["']([^"']+)["']/.exec(fullTag)

    const sequenceFlowId  = idMatch?.[1]?.trim()
    const sourceElementId = sourceMatch?.[1]?.trim()
    const targetElementId = targetMatch?.[1]?.trim()

    if (!sequenceFlowId || !sourceElementId || !targetElementId) continue

    const label = nameMatch?.[1]?.trim() ?? null

    // Extract conditionExpression from the full matched tag (already captured by flowRegex)
    let expression: string | null = null
    let conditionType = 'always'

    const exprMatch = /<(?:bpmn2?:)?conditionExpression[^>]*>([\s\S]*?)<\/(?:bpmn2?:)?conditionExpression>/i.exec(fullTag)
    if (exprMatch) {
      expression = exprMatch[1].trim() || null
      conditionType = expression ? 'expression' : 'always'
    }

    transitions.push({
      sequenceFlowId,
      sourceElementId,
      targetElementId,
      name: label,
      label,
      outcome: label ?? null,
      conditionType,
      metadataFieldId: null,
      expectedValue: null,
      expression,
      isDefault: false,
      orderIndex: flowIndex++,
      config: {},
    })
  }

  return { elements, transitions }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  )
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'sim', 's'].includes(normalized)) return true
    if (['false', '0', 'no', 'nao', 'não', 'n'].includes(normalized)) return false
  }
  return fallback
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      return { value: parsed }
    } catch { return { value } }
  }
  return { value }
}

function normalizeJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  return []
}

// ─── Row normalizers ──────────────────────────────────────────────────────────

function normalizeWorkflowRow(item: any) {
  if (!item) return item
  return {
    id: String(item.id),
    publicId: item.public_id ?? null,
    accountId: item.account_id ?? null,
    processId: item.process_id ?? null,
    processName: item.process_name ?? null,
    environmentId: item.environment_id ?? null,
    environmentName: item.environment_name ?? null,
    name: item.name ?? '',
    description: item.description ?? undefined,
    version: item.version ?? '1.0',
    status: item.status ?? 'draft',
    documentTypeId: item.document_type_id ?? null,
    documentTypeName: item.document_type_name ?? null,
    bpmnXml: item.bpmn_xml ?? '',
    stepsCount: item.steps_count ?? 0,
    permissions: item.permissions ?? {},
    elementConfigs: normalizeJsonArray(item.element_configs),
    snapshots: normalizeJsonArray(item.snapshots),
    scopeLevel: item.scope_level ?? 'account',
    tenantId: item.tenant_id ?? null,
    accountName: item.account_name ?? null,
    publishedAt: item.published_at ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
  }
}

function normalizeWorkflowElementRow(row: any) {
  return {
    id: row.id,
    publicId: row.public_id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    processId: row.process_id,
    processName: row.process_name,
    elementId: row.element_id,
    elementType: row.element_type,
    elementKind: row.element_kind,
    name: row.name,
    description: row.description,
    orderIndex: row.order_index,
    isStart: row.is_start,
    isEnd: row.is_end,
    isExecutable: row.is_executable,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeWorkflowTransitionRow(row: any) {
  return {
    id: row.id,
    publicId: row.public_id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    processId: row.process_id,
    processName: row.process_name,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeWorkflowElementConfigRow(row: any) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowElementId: row.workflow_element_id,
    accountId: row.account_id,
    elementId: row.element_id,
    elementType: row.element_type ?? '',
    elementName: row.element_name ?? row.name ?? undefined,
    kind: row.config_type,
    configType: row.config_type,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Fallback builders (from elementConfigs JSONB) ────────────────────────────

function buildFallbackElementsFromElementConfigs(
  elementConfigs: any[],
): WorkflowElementPayload[] {
  return elementConfigs
    .filter((item) => item?.elementId && item?.kind !== 'flow')
    .map((item, index) => ({
      elementId: String(item.elementId),
      elementType: String(item.elementType ?? ''),
      elementKind: String(item.kind ?? item.configType ?? 'activity'),
      name: item.elementName ?? item.name ?? null,
      description: null,
      orderIndex: index,
      isStart: item.kind === 'start',
      isEnd: item.kind === 'end',
      isExecutable: [
        'activity', 'subprocess', 'system-task', 'notification',
        'message', 'timer', 'signal', 'conditional',
      ].includes(String(item.kind ?? '')),
      config: item.config ?? {},
    }))
    .filter((item) => item.elementId && item.elementType && item.elementKind)
}

function buildFallbackTransitionsFromElementConfigs(
  elementConfigs: any[],
): WorkflowTransitionPayload[] {
  return elementConfigs
    .filter((item) => item?.elementId && item?.kind === 'flow')
    .map((item, index) => {
      const config = normalizeJsonObject(item.config)
      return {
        sequenceFlowId: String(item.elementId),
        sourceElementId: String(config.sourceId ?? ''),
        targetElementId: String(config.targetId ?? ''),
        name: item.elementName ?? config.label ?? null,
        label: config.label ?? item.elementName ?? null,
        outcome: config.outcome ?? null,
        conditionType: config.conditionType ?? 'always',
        metadataFieldId: config.metadataFieldId ?? null,
        expectedValue: config.expectedValue ?? null,
        expression: config.expression ?? null,
        isDefault: toBoolean(config.isDefault, false),
        orderIndex: index,
        config,
      }
    })
    .filter((item) => item.sequenceFlowId && item.sourceElementId && item.targetElementId)
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function deleteWorkflowChildren(client: any, workflowId: string) {
  const tables = [
    'workflow_activity_config_users',
    'workflow_activity_config_roles',
    'workflow_activity_config_groups',
    'workflow_activity_config_areas',
    'workflow_activity_config_positions',
    'workflow_activity_config_disciplines',
    'workflow_activity_metadata',
    'workflow_activity_actions',
    'workflow_activity_configs',
    'workflow_element_configs',
    'workflow_transitions',
    'workflow_elements',
  ]
  for (const table of tables) {
    await client.query(
      `DELETE FROM ${table} WHERE workflow_id::text = $1::text`,
      [workflowId],
    )
  }
}

async function persistWorkflowElements(
  client: any,
  workflowId: string,
  accountId: string,
  processId: string | null,
  processName: string | null,
  elements: WorkflowElementPayload[],
) {
  for (let i = 0; i < elements.length; i++) {
    const item = elements[i]
    if (!item.elementId || !item.elementType || !item.elementKind) {
      console.warn('[persistWorkflowElements] elemento ignorado:', item)
      continue
    }
    await client.query(
      `INSERT INTO workflow_elements (
        id, public_id, workflow_id, account_id, process_id, process_name,
        element_id, element_type, element_kind, name, description,
        order_index, is_start, is_end, is_executable, config,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,NOW(),NOW())`,
      [
        uuidv4(), uuidv4(), workflowId, accountId, processId, processName,
        item.elementId, item.elementType, item.elementKind,
        item.name ?? null, item.description ?? null, item.orderIndex ?? i,
        toBoolean(item.isStart, false), toBoolean(item.isEnd, false),
        toBoolean(item.isExecutable, false), JSON.stringify(item.config ?? {}),
      ],
    )
  }
}

async function persistWorkflowTransitions(
  client: any,
  workflowId: string,
  accountId: string,
  processId: string | null,
  processName: string | null,
  transitions: WorkflowTransitionPayload[],
) {
  for (let i = 0; i < transitions.length; i++) {
    const item = transitions[i]
    if (!item.sequenceFlowId || !item.sourceElementId || !item.targetElementId) {
      console.warn('[persistWorkflowTransitions] transição ignorada:', item)
      continue
    }
    await client.query(
      `INSERT INTO workflow_transitions (
        id, public_id, workflow_id, account_id, process_id, process_name,
        sequence_flow_id, source_element_id, target_element_id,
        name, label, outcome, condition_type, metadata_field_id,
        expected_value, expression, is_default, order_index, config,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,NOW(),NOW())`,
      [
        uuidv4(), uuidv4(), workflowId, accountId, processId, processName,
        item.sequenceFlowId, item.sourceElementId, item.targetElementId,
        item.name ?? null, item.label ?? null, item.outcome ?? null,
        item.conditionType ?? 'always', item.metadataFieldId ?? null,
        item.expectedValue ?? null, item.expression ?? null,
        toBoolean(item.isDefault, false), item.orderIndex ?? i,
        JSON.stringify(item.config ?? {}),
      ],
    )
  }
}

async function persistWorkflowElementConfigs(
  client: any,
  workflowId: string,
  accountId: string,
  elementConfigs: any[],
) {
  for (const item of elementConfigs) {
    if (!item?.elementId || item.kind === 'flow') continue

    const elementResult = await client.query(
      `SELECT id FROM workflow_elements
       WHERE workflow_id::text = $1::text AND element_id = $2 LIMIT 1`,
      [workflowId, item.elementId],
    )
    const workflowElementId = elementResult.rows[0]?.id
    if (!workflowElementId) {
      console.warn('[persistWorkflowElementConfigs] elemento não encontrado:', {
        workflowId, elementId: item.elementId, kind: item.kind,
      })
      continue
    }

    await client.query(
      `INSERT INTO workflow_element_configs (
        id, workflow_id, workflow_element_id, account_id,
        element_id, config_type, config, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW(),NOW())`,
      [
        uuidv4(), workflowId, workflowElementId, accountId,
        item.elementId, item.kind ?? item.configType ?? 'generic',
        JSON.stringify(item.config ?? {}),
      ],
    )
  }
}

async function persistActivityConfigs(
  client: any,
  workflowId: string,
  configs: WorkflowActivityConfigPayload[],
) {
  for (const item of configs) {
    if (!item.elementId) continue

    await client.query(
      `INSERT INTO workflow_activity_configs (
        id, workflow_id, element_id, element_name, activity_type, assignment_mode,
        deadline_mode, deadline_value, deadline_fixed_at, instructions, help_text,
        background_color, border_color, text_color, icon_name,
        allow_approve, allow_reject, allow_request_changes, allow_forward,
        allow_comment, allow_attachment, notify_on_enter, notify_on_exit,
        linked_workflow_id, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,NOW(),NOW()
      )`,
      [
        uuidv4(), workflowId, item.elementId, item.elementName ?? null,
        item.activityType ?? 'activity', item.assignmentMode ?? 'user',
        item.deadlineMode ?? null, item.deadlineValue ?? null, item.deadlineFixedAt ?? null,
        item.instructions ?? null, item.helpText ?? null,
        item.backgroundColor ?? null, item.borderColor ?? null,
        item.textColor ?? null, item.iconName ?? null,
        toBoolean(item.allowApprove, false), toBoolean(item.allowReject, false),
        toBoolean(item.allowRequestChanges, false), toBoolean(item.allowForward, false),
        toBoolean(item.allowComment, true), toBoolean(item.allowAttachment, true),
        toBoolean(item.notifyOnEnter, false), toBoolean(item.notifyOnExit, false),
        item.linkedWorkflowId ?? null,
      ],
    )

    const responsibles: Array<[string[], string, string]> = [
      [toStringArray(item.responsibleUserIds),       'workflow_activity_config_users',       'user_id'],
      [toStringArray(item.responsibleRoleIds),        'workflow_activity_config_roles',       'role_id'],
      [toStringArray(item.responsibleGroupIds),       'workflow_activity_config_groups',      'group_id'],
      [toStringArray(item.responsibleAreaIds),        'workflow_activity_config_areas',       'area_id'],
      [toStringArray(item.responsiblePositionIds),    'workflow_activity_config_positions',   'position_id'],
      [toStringArray(item.responsibleDisciplineIds),  'workflow_activity_config_disciplines', 'discipline_id'],
    ]

    for (const [ids, table, column] of responsibles) {
      for (const [index, id] of ids.entries()) {
        await client.query(
          `INSERT INTO ${table} (id, workflow_id, element_id, ${column}, order_index, created_at)
           VALUES ($1,$2,$3,$4,$5,NOW())`,
          [uuidv4(), workflowId, item.elementId, id, index],
        )
      }
    }
  }
}

async function persistActivityActions(
  client: any,
  workflowId: string,
  actions: WorkflowActivityActionPayload[],
) {
  for (const item of actions) {
    if (!item.elementId || !item.actionKey || !item.actionName || !item.actionLabel) {
      console.warn('[persistActivityActions] ação ignorada:', item)
      continue
    }
    await client.query(
      `INSERT INTO workflow_activity_actions (
        id, workflow_id, element_id, action_key, action_name, action_label,
        description, outcome, button_color, text_color, icon_name, next_element_id,
        order_index, is_default, is_active, requires_comment, requires_attachment,
        confirmation_message, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())`,
      [
        uuidv4(), workflowId, item.elementId, item.actionKey,
        item.actionName, item.actionLabel,
        item.description ?? null, item.outcome ?? null,
        item.buttonColor ?? null, item.textColor ?? null,
        item.iconName ?? null, item.nextElementId ?? null,
        toNumber(item.orderIndex, 0), toBoolean(item.isDefault, false),
        toBoolean(item.isActive, true), toBoolean(item.requiresComment, false),
        toBoolean(item.requiresAttachment, false), item.confirmationMessage ?? null,
      ],
    )
  }
}

async function persistActivityMetadata(
  client: any,
  workflowId: string,
  metadata: WorkflowActivityMetadataPayload[],
) {
  for (const item of metadata) {
    if (!item.elementId || !item.metadataDefinitionId) {
      console.warn('[persistActivityMetadata] metadado ignorado:', item)
      continue
    }
    await client.query(
      `INSERT INTO workflow_activity_metadata (
        id, workflow_id, element_id, metadata_definition_id,
        is_required, is_read_only, order_index, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [
        uuidv4(), workflowId, item.elementId, item.metadataDefinitionId,
        toBoolean(item.isRequired, false), toBoolean(item.isReadOnly, false),
        toNumber(item.orderIndex, 0),
      ],
    )
  }
}

// ─── findWorkflowFullById ─────────────────────────────────────────────────────

async function findWorkflowFullById(
  workflowId: string,
  accountId: string,
  executor: any = db,
) {
  const workflowResult = await executor.query(
    `SELECT * FROM workflows
     WHERE account_id = $1
       AND (id::text = $2::text OR public_id::text = $2::text)
     LIMIT 1`,
    [accountId, workflowId],
  )

  const workflowRow = workflowResult.rows[0]
  if (!workflowRow) return null

  const resolvedWorkflowId = workflowRow.id

  const [elementsResult, transitionsResult, elementConfigsResult] = await Promise.all([
    executor.query(
      `SELECT * FROM workflow_elements
       WHERE workflow_id::text = $1::text
       ORDER BY order_index ASC NULLS LAST, created_at ASC`,
      [resolvedWorkflowId],
    ),
    executor.query(
      `SELECT * FROM workflow_transitions
       WHERE workflow_id::text = $1::text
       ORDER BY order_index ASC NULLS LAST, created_at ASC`,
      [resolvedWorkflowId],
    ),
    executor.query(
      `SELECT c.*, e.element_type, e.name AS element_name
       FROM workflow_element_configs c
       LEFT JOIN workflow_elements e ON e.id = c.workflow_element_id
       WHERE c.workflow_id::text = $1::text
       ORDER BY c.created_at ASC`,
      [resolvedWorkflowId],
    ),
  ])

  const normalizedWorkflow = normalizeWorkflowRow(workflowRow)
  const elements    = elementsResult.rows.map(normalizeWorkflowElementRow)
  const transitions = transitionsResult.rows.map(normalizeWorkflowTransitionRow)
  const elementConfigsFromTable = elementConfigsResult.rows.map(normalizeWorkflowElementConfigRow)

  // ── Merge elementConfigs ─────────────────────────────────────────────────
  // The frontend expects workflow.elementConfigs to contain the per-element
  // config objects (with actions, responsibles, etc.) that it uses in
  // buildWorkflowStepsFromWorkflow(). We enrich the JSONB snapshot with the
  // relational rows so both reading paths work correctly.
  const enrichedElementConfigs = mergeElementConfigs(
    normalizedWorkflow.elementConfigs,
    elementConfigsFromTable,
  )

  return {
    ...normalizedWorkflow,
    elements,
    transitions,
    elementConfigs: enrichedElementConfigs,
  }
}

/**
 * Merges the JSONB elementConfigs snapshot (used by the frontend to build steps)
 * with the relational elementConfigs rows (normalised from workflow_element_configs).
 *
 * Rules:
 * 1. Start from the JSONB array (richer per-element config with actions, responsibles, etc.)
 * 2. Fill in any elements that only exist in the relational table but are missing from JSONB.
 * 3. Return a unified array the frontend can consume.
 */
function mergeElementConfigs(
  jsonbConfigs: any[],
  tableConfigs: any[],
): any[] {
  const jsonbById = new Map<string, any>()
  for (const item of jsonbConfigs) {
    const id = String(item?.elementId ?? '').trim()
    if (id) jsonbById.set(id, item)
  }

  const tableById = new Map<string, any>()
  for (const item of tableConfigs) {
    const id = String(item?.elementId ?? '').trim()
    if (id) tableById.set(id, item)
  }

  const merged: any[] = [...jsonbConfigs]

  for (const [elementId, tableItem] of tableById.entries()) {
    if (!jsonbById.has(elementId)) {
      // Element only in relational table → add to merged list
      merged.push({
        elementId,
        elementName: tableItem.elementName ?? null,
        elementType: tableItem.elementType ?? '',
        kind: tableItem.kind ?? tableItem.configType ?? 'activity',
        configType: tableItem.configType ?? tableItem.kind ?? 'activity',
        config: tableItem.config ?? {},
      })
    }
  }

  return merged
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function findAll(req: AuthenticatedRequest, res: Response) {
  try {
    const accountId = req.user?.accountId ?? null
    const processId =
      typeof req.query.processId === 'string' ? req.query.processId : null

    if (!accountId) {
      return res.status(401).json({ success: false, message: 'AccountId não encontrado.' })
    }

    const result = processId
      ? await db.query(
          `SELECT * FROM workflows WHERE account_id = $1 AND process_id = $2 ORDER BY updated_at DESC, name ASC`,
          [accountId, processId],
        )
      : await db.query(
          `SELECT * FROM workflows WHERE account_id = $1 ORDER BY updated_at DESC, name ASC`,
          [accountId],
        )

    return res.status(200).json(result.rows.map(normalizeWorkflowRow))
  } catch (error: any) {
    console.error('[workflowsController.findAll] error =>', error)
    return res.status(500).json({ success: false, message: 'Erro ao listar workflows.', error: error?.message })
  }
}

async function findOne(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params
    const accountId = req.user?.accountId ?? null

    if (!accountId) {
      return res.status(401).json({ success: false, message: 'AccountId não encontrado.' })
    }

    const workflow = await findWorkflowFullById(id, accountId)
    if (!workflow) {
      return res.status(404).json({ success: false, message: 'Workflow não encontrado.' })
    }

    return res.status(200).json(workflow)
  } catch (error: any) {
    console.error('[workflowsController.findOne] error =>', error)
    return res.status(500).json({ success: false, message: 'Erro ao buscar workflow.', error: error?.message })
  }
}

async function saveWorkflow(req: AuthenticatedRequest, res: Response) {
  const client = await db.pool.connect()

  try {
    await client.query('BEGIN')

    const body = (req.body ?? {}) as SaveWorkflowBody
    const accountId = req.user?.accountId ?? body.tenantId ?? null
    const requestedWorkflowId = String(req.params.id ?? body.id ?? '').trim()
    const isUpdate = Boolean(requestedWorkflowId)

    if (!accountId) {
      await client.query('ROLLBACK')
      return res.status(401).json({ success: false, message: 'AccountId não encontrado.' })
    }
    if (!body.name?.trim()) {
      await client.query('ROLLBACK')
      return res.status(400).json({ success: false, message: 'Nome do workflow é obrigatório.' })
    }

    const elementConfigs = Array.isArray(body.elementConfigs) ? body.elementConfigs : []

    // ── Resolve elements & transitions ───────────────────────────────────
    // ALWAYS parse bpmnXml first — it is the single source of truth for the
    // graph structure. body.elements / body.transitions come from the frontend
    // elementConfigs array which never contains the sequenceFlow items, so
    // they cannot be trusted for transitions. We fall back to them only when
    // the XML produces nothing (e.g. programmatic workflow creation without XML).
    let elements: WorkflowElementPayload[]
    let transitions: WorkflowTransitionPayload[]

    const bpmnParsed = body.bpmnXml?.trim() ? parseBpmnXml(body.bpmnXml) : null

    console.log('[saveWorkflow] bpmnParsed =>', {
      elements: bpmnParsed?.elements.length ?? 0,
      transitions: bpmnParsed?.transitions.length ?? 0,
    })

    if (bpmnParsed && bpmnParsed.elements.length > 0) {
      // XML parsed successfully — use it as the authoritative source
      elements = bpmnParsed.elements
    } else if (Array.isArray(body.elements) && body.elements.length > 0) {
      elements = body.elements
    } else {
      elements = buildFallbackElementsFromElementConfigs(elementConfigs)
    }

    if (bpmnParsed && bpmnParsed.transitions.length > 0) {
      // XML parsed successfully — use it as the authoritative source
      transitions = bpmnParsed.transitions
    } else if (Array.isArray(body.transitions) && body.transitions.length > 0) {
      transitions = body.transitions
    } else {
      transitions = buildFallbackTransitionsFromElementConfigs(elementConfigs)
    }

    const activityConfigs  = Array.isArray(body.activityConfigs)  ? body.activityConfigs  : []
    const activityActions  = Array.isArray(body.activityActions)  ? body.activityActions  : []
    const activityMetadata = Array.isArray(body.activityMetadata) ? body.activityMetadata : []

    console.log('[saveWorkflow] início =>', {
      requestedWorkflowId: requestedWorkflowId || '(novo)',
      isUpdate,
      accountId,
      name: body.name,
      elements: elements.length,
      transitions: transitions.length,
      elementConfigs: elementConfigs.length,
      activityConfigs: activityConfigs.length,
      activityActions: activityActions.length,
    })

    let savedWorkflowId = requestedWorkflowId

    if (isUpdate) {
      const updateResult = await client.query(
        `UPDATE workflows SET
          account_id=$1, name=$2, description=$3, version=$4, status=$5,
          document_type_id=$6, document_type_name=$7, process_id=$8, process_name=$9,
          environment_id=$10, environment_name=$11, scope_level=$12, tenant_id=$13,
          account_name=$14, bpmn_xml=$15, steps_count=$16, permissions=$17::jsonb,
          element_configs=$18::jsonb, snapshots=$19::jsonb, published_at=$20, updated_at=NOW()
         WHERE account_id=$21 AND (id::text=$22::text OR public_id::text=$22::text)
         RETURNING *`,
        [
          accountId, body.name, body.description ?? null, body.version ?? '1.0',
          body.status ?? 'draft', body.documentTypeId ?? null, body.documentTypeName ?? null,
          body.processId ?? null, body.processName ?? null,
          body.environmentId ?? null, body.environmentName ?? null,
          body.scopeLevel ?? (body.processId ? 'process' : 'account'),
          body.tenantId ?? accountId, body.accountName ?? null,
          body.bpmnXml ?? '',
          body.stepsCount ?? elements.filter((e) => e.isExecutable).length,
          JSON.stringify(body.permissions ?? {}),
          JSON.stringify(elementConfigs),
          JSON.stringify(body.snapshots ?? []),
          body.publishedAt ?? null,
          accountId, requestedWorkflowId,
        ],
      )

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(404).json({ success: false, message: 'Workflow não encontrado.' })
      }

      savedWorkflowId = updateResult.rows[0].id
    } else {
      const insertResult = await client.query(
        `INSERT INTO workflows (
          id, public_id, account_id, name, description, version, status,
          document_type_id, document_type_name, process_id, process_name,
          environment_id, environment_name, scope_level, tenant_id, account_name,
          bpmn_xml, steps_count, permissions, element_configs, snapshots,
          published_at, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19::jsonb,$20::jsonb,$21::jsonb,$22,NOW(),NOW()
        ) RETURNING *`,
        [
          uuidv4(), uuidv4(), accountId, body.name, body.description ?? null,
          body.version ?? '1.0', body.status ?? 'draft',
          body.documentTypeId ?? null, body.documentTypeName ?? null,
          body.processId ?? null, body.processName ?? null,
          body.environmentId ?? null, body.environmentName ?? null,
          body.scopeLevel ?? (body.processId ? 'process' : 'account'),
          body.tenantId ?? accountId, body.accountName ?? null,
          body.bpmnXml ?? '',
          body.stepsCount ?? elements.filter((e) => e.isExecutable).length,
          JSON.stringify(body.permissions ?? {}),
          JSON.stringify(elementConfigs),
          JSON.stringify(body.snapshots ?? []),
          body.publishedAt ?? null,
        ],
      )
      savedWorkflowId = insertResult.rows[0].id
    }

    await deleteWorkflowChildren(client, savedWorkflowId)

    await persistWorkflowElements(client, savedWorkflowId, accountId, body.processId ?? null, body.processName ?? null, elements)
    await persistWorkflowTransitions(client, savedWorkflowId, accountId, body.processId ?? null, body.processName ?? null, transitions)
    await persistWorkflowElementConfigs(client, savedWorkflowId, accountId, elementConfigs)
    await persistActivityConfigs(client, savedWorkflowId, activityConfigs)
    await persistActivityActions(client, savedWorkflowId, activityActions)
    await persistActivityMetadata(client, savedWorkflowId, activityMetadata)

    const workflow = await findWorkflowFullById(savedWorkflowId, accountId, client)

    await client.query('COMMIT')

    console.log('[saveWorkflow] salvo com sucesso =>', {
      workflowId: savedWorkflowId,
      elements: elements.length,
      transitions: transitions.length,
    })

    return res.status(200).json(workflow)
  } catch (error: any) {
    try { await client.query('ROLLBACK') } catch {}
    console.error('[workflowsController.saveWorkflow] error =>', error)
    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar workflow.',
      error: error?.message ?? 'Erro interno',
      detail: error?.detail ?? null,
      hint: error?.hint ?? null,
      code: error?.code ?? null,
      table: error?.table ?? null,
      column: error?.column ?? null,
      constraint: error?.constraint ?? null,
    })
  } finally {
    client.release()
  }
}

export default { findAll, findOne, saveWorkflow }