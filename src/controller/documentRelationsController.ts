import { randomUUID } from 'crypto'
import { Response } from 'express'
import db from '../config/database'
import type { AuthenticatedRequest } from '../middleware/authMiddleware'

type DocumentRelationStatus =
  | 'created'
  | 'waiting_child'
  | 'child_completed'
  | 'parent_continued'
  | 'cancelled'
  | 'error'

type DocumentRelationType =
  | 'subprocess'
  | 'related-document'
  | 'corrective-action'
  | 'risk-review'

type WaitPolicy = 'all_children' | 'any_child'

const ALLOWED_RELATION_TYPES: DocumentRelationType[] = [
  'subprocess',
  'related-document',
  'corrective-action',
  'risk-review',
]

const ALLOWED_STATUSES: DocumentRelationStatus[] = [
  'created',
  'waiting_child',
  'child_completed',
  'parent_continued',
  'cancelled',
  'error',
]

const ALLOWED_WAIT_POLICIES: WaitPolicy[] = ['all_children', 'any_child']

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null

  const normalized = String(value).trim()

  return normalized || null
}

function normalizeUuid(value: unknown): string | null {
  return normalizeString(value)
}

function normalizeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
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

function normalizeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {}

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }

      return {
        value: parsed,
      }
    } catch {
      return {
        value,
      }
    }
  }

  return {
    value,
  }
}

function getLoggedUser(req: AuthenticatedRequest) {
  return {
    id: req.user?.id ?? 'system',
    name: req.user?.name ?? req.user?.email ?? 'Sistema',
    accountId: req.user?.accountId ?? null,
  }
}

function mapDocumentRelation(row: any) {
  if (!row) return null

  return {
    id: row.id,

    accountId: row.account_id,

    relationGroupId: row.relation_group_id,

    parentDocumentId: row.parent_document_id,
    parentDocumentInstanceId: row.parent_document_instance_id,

    childDocumentId: row.child_document_id,
    childDocumentInstanceId: row.child_document_instance_id,

    relationType: row.relation_type,

    sourceTableMetadataDefinitionId: row.source_table_metadata_definition_id,
    sourceTableName: row.source_table_name,
    sourceRowKey: row.source_row_key,
    sourceRowIndex: row.source_row_index,
    sourceRowValue: row.source_row_value,

    parentProcessId: row.parent_process_id,
    parentProcessName: row.parent_process_name,

    childProcessId: row.child_process_id,
    childProcessName: row.child_process_name,

    childWorkflowId: row.child_workflow_id,
    childWorkflowName: row.child_workflow_name,

    waitForCompletion: row.wait_for_completion,
    waitPolicy: row.wait_policy,

    status: row.status,

    parentWaitingElementId: row.parent_waiting_element_id,
    parentNextElementId: row.parent_next_element_id,

    createdById: row.created_by_id,
    createdByName: row.created_by_name,

    childCompletedAt: row.child_completed_at,
    parentContinuedAt: row.parent_continued_at,

    createdAt: row.created_at,
    updatedAt: row.updated_at,

    parentDocumentTitle: row.parent_document_title,
    parentDocumentCode: row.parent_document_code,

    childDocumentTitle: row.child_document_title,
    childDocumentCode: row.child_document_code,

    parentInstanceRevision: row.parent_instance_revision,
    childInstanceRevision: row.child_instance_revision,

    parentInstanceStatus: row.parent_instance_status,
    childInstanceStatus: row.child_instance_status,
  }
}

async function findDocumentById(documentId: string) {
  const result = await db.query(
    `
    SELECT *
    FROM documents
    WHERE id::text = $1::text
    LIMIT 1
    `,
    [documentId],
  )

  return result.rows[0] ?? null
}

async function findDocumentInstanceById(documentInstanceId: string) {
  const result = await db.query(
    `
    SELECT *
    FROM document_instances
    WHERE id::text = $1::text
    LIMIT 1
    `,
    [documentInstanceId],
  )

  return result.rows[0] ?? null
}

async function findRelationRawById(id: string) {
  const result = await db.query(
    `
    SELECT
      dr.*,

      pd.title AS parent_document_title,
      pd.code AS parent_document_code,

      cd.title AS child_document_title,
      cd.code AS child_document_code,

      pdi.revision AS parent_instance_revision,
      cdi.revision AS child_instance_revision,

      pdi.status AS parent_instance_status,
      cdi.status AS child_instance_status

    FROM document_relations dr

    INNER JOIN documents pd
      ON pd.id = dr.parent_document_id

    INNER JOIN documents cd
      ON cd.id = dr.child_document_id

    INNER JOIN document_instances pdi
      ON pdi.id = dr.parent_document_instance_id

    INNER JOIN document_instances cdi
      ON cdi.id = dr.child_document_instance_id

    WHERE dr.id::text = $1::text
    LIMIT 1
    `,
    [id],
  )

  return result.rows[0] ?? null
}

async function insertDocumentRelation(params: {
  accountId: string

  relationGroupId: string

  parentDocumentId: string
  parentDocumentInstanceId: string

  childDocumentId: string
  childDocumentInstanceId: string

  relationType: DocumentRelationType

  sourceTableMetadataDefinitionId?: string | null
  sourceTableName?: string | null
  sourceRowKey?: string | null
  sourceRowIndex?: number | null
  sourceRowValue?: Record<string, any>

  parentProcessId?: string | null
  parentProcessName?: string | null

  childProcessId: string
  childProcessName?: string | null

  childWorkflowId?: string | null
  childWorkflowName?: string | null

  waitForCompletion: boolean
  waitPolicy: WaitPolicy

  parentWaitingElementId?: string | null
  parentNextElementId?: string | null

  createdById: string
  createdByName?: string | null
}) {
  const initialStatus: DocumentRelationStatus = params.waitForCompletion
    ? 'waiting_child'
    : 'parent_continued'

  const result = await db.query(
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
      $7,
      $8,
      $9,
      $10,
      $11,
      $12::jsonb,
      $13,
      $14,
      $15,
      $16,
      $17,
      $18,
      $19,
      $20,
      $21,
      $22,
      $23,
      $24,
      $25,
      NOW(),
      NOW()
    )
    RETURNING *
    `,
    [
      params.accountId,

      params.relationGroupId,

      params.parentDocumentId,
      params.parentDocumentInstanceId,

      params.childDocumentId,
      params.childDocumentInstanceId,

      params.relationType,

      params.sourceTableMetadataDefinitionId ?? null,
      params.sourceTableName ?? null,
      params.sourceRowKey ?? null,
      params.sourceRowIndex ?? null,
      JSON.stringify(params.sourceRowValue ?? {}),

      params.parentProcessId ?? null,
      params.parentProcessName ?? null,

      params.childProcessId,
      params.childProcessName ?? null,

      params.childWorkflowId ?? null,
      params.childWorkflowName ?? null,

      params.waitForCompletion,
      params.waitPolicy,

      initialStatus,

      params.parentWaitingElementId ?? null,
      params.parentNextElementId ?? null,

      params.createdById,
      params.createdByName ?? null,
    ],
  )

  if (params.waitForCompletion) {
    await db.query(
      `
      UPDATE document_instances
      SET status = 'waiting_subprocess',
          updated_at = NOW()
      WHERE id::text = $1::text
      `,
      [params.parentDocumentInstanceId],
    )
  }

  return result.rows[0]
}

function buildRelationPayload(req: AuthenticatedRequest, body: any) {
  const loggedUser = getLoggedUser(req)

  const relationType =
    normalizeString(body.relationType ?? body.relation_type) ?? 'subprocess'

  const waitPolicy =
    normalizeString(body.waitPolicy ?? body.wait_policy) ?? 'all_children'

  if (!ALLOWED_RELATION_TYPES.includes(relationType as DocumentRelationType)) {
    throw new Error(
      `relationType inválido. Valores permitidos: ${ALLOWED_RELATION_TYPES.join(
        ', ',
      )}.`,
    )
  }

  if (!ALLOWED_WAIT_POLICIES.includes(waitPolicy as WaitPolicy)) {
    throw new Error(
      `waitPolicy inválido. Valores permitidos: ${ALLOWED_WAIT_POLICIES.join(
        ', ',
      )}.`,
    )
  }

  return {
    relationGroupId:
      normalizeUuid(body.relationGroupId ?? body.relation_group_id) ??
      randomUUID(),

    parentDocumentId: normalizeUuid(
      body.parentDocumentId ?? body.parent_document_id,
    ),

    parentDocumentInstanceId: normalizeUuid(
      body.parentDocumentInstanceId ?? body.parent_document_instance_id,
    ),

    childDocumentId: normalizeUuid(
      body.childDocumentId ?? body.child_document_id,
    ),

    childDocumentInstanceId: normalizeUuid(
      body.childDocumentInstanceId ?? body.child_document_instance_id,
    ),

    relationType: relationType as DocumentRelationType,

    sourceTableMetadataDefinitionId: normalizeString(
      body.sourceTableMetadataDefinitionId ??
        body.source_table_metadata_definition_id,
    ),

    sourceTableName: normalizeString(
      body.sourceTableName ?? body.source_table_name,
    ),

    sourceRowKey: normalizeString(body.sourceRowKey ?? body.source_row_key),

    sourceRowIndex: normalizeNumber(
      body.sourceRowIndex ?? body.source_row_index,
    ),

    sourceRowValue: normalizeJsonObject(
      body.sourceRowValue ?? body.source_row_value,
    ),

    parentProcessId: normalizeString(
      body.parentProcessId ?? body.parent_process_id,
    ),

    parentProcessName: normalizeString(
      body.parentProcessName ?? body.parent_process_name,
    ),

    childProcessId: normalizeString(
      body.childProcessId ?? body.child_process_id,
    ),

    childProcessName: normalizeString(
      body.childProcessName ?? body.child_process_name,
    ),

    childWorkflowId: normalizeString(
      body.childWorkflowId ?? body.child_workflow_id,
    ),

    childWorkflowName: normalizeString(
      body.childWorkflowName ?? body.child_workflow_name,
    ),

    waitForCompletion: normalizeBoolean(
      body.waitForCompletion ?? body.wait_for_completion,
      false,
    ),

    waitPolicy: waitPolicy as WaitPolicy,

    parentWaitingElementId: normalizeString(
      body.parentWaitingElementId ?? body.parent_waiting_element_id,
    ),

    parentNextElementId: normalizeString(
      body.parentNextElementId ?? body.parent_next_element_id,
    ),

    createdById:
      normalizeString(body.createdById ?? body.created_by_id) ?? loggedUser.id,

    createdByName:
      normalizeString(body.createdByName ?? body.created_by_name) ??
      loggedUser.name,
  }
}

export async function createDocumentRelation(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const payload = buildRelationPayload(req, req.body ?? {})

    if (!payload.parentDocumentId) {
      return res.status(400).json({
        success: false,
        message: 'parentDocumentId é obrigatório.',
      })
    }

    if (!payload.parentDocumentInstanceId) {
      return res.status(400).json({
        success: false,
        message: 'parentDocumentInstanceId é obrigatório.',
      })
    }

    if (!payload.childDocumentId) {
      return res.status(400).json({
        success: false,
        message: 'childDocumentId é obrigatório.',
      })
    }

    if (!payload.childDocumentInstanceId) {
      return res.status(400).json({
        success: false,
        message: 'childDocumentInstanceId é obrigatório.',
      })
    }

    if (!payload.childProcessId) {
      return res.status(400).json({
        success: false,
        message: 'childProcessId é obrigatório.',
      })
    }

    const parentDocument = await findDocumentById(payload.parentDocumentId)
    const childDocument = await findDocumentById(payload.childDocumentId)

    if (!parentDocument) {
      return res.status(404).json({
        success: false,
        message: 'Documento pai não encontrado.',
      })
    }

    if (!childDocument) {
      return res.status(404).json({
        success: false,
        message: 'Documento filho não encontrado.',
      })
    }

    const parentInstance = await findDocumentInstanceById(
      payload.parentDocumentInstanceId,
    )

    const childInstance = await findDocumentInstanceById(
      payload.childDocumentInstanceId,
    )

    if (!parentInstance) {
      return res.status(404).json({
        success: false,
        message: 'Instância pai não encontrada.',
      })
    }

    if (!childInstance) {
      return res.status(404).json({
        success: false,
        message: 'Instância filha não encontrada.',
      })
    }

    const accountId =
      getLoggedUser(req).accountId ??
      parentDocument.account_id ??
      parentInstance.account_id

    const inserted = await insertDocumentRelation({
      accountId,

      relationGroupId: payload.relationGroupId,

      parentDocumentId: payload.parentDocumentId,
      parentDocumentInstanceId: payload.parentDocumentInstanceId,

      childDocumentId: payload.childDocumentId,
      childDocumentInstanceId: payload.childDocumentInstanceId,

      relationType: payload.relationType,

      sourceTableMetadataDefinitionId:
        payload.sourceTableMetadataDefinitionId,
      sourceTableName: payload.sourceTableName,
      sourceRowKey: payload.sourceRowKey,
      sourceRowIndex: payload.sourceRowIndex,
      sourceRowValue: payload.sourceRowValue,

      parentProcessId: payload.parentProcessId ?? parentInstance.process_id,
      parentProcessName:
        payload.parentProcessName ?? parentInstance.process_name,

      childProcessId: payload.childProcessId,
      childProcessName: payload.childProcessName,

      childWorkflowId: payload.childWorkflowId,
      childWorkflowName: payload.childWorkflowName,

      waitForCompletion: payload.waitForCompletion,
      waitPolicy: payload.waitPolicy,

      parentWaitingElementId:
        payload.parentWaitingElementId ?? parentInstance.current_element_id,
      parentNextElementId: payload.parentNextElementId,

      createdById: payload.createdById,
      createdByName: payload.createdByName,
    })

    const relation = await findRelationRawById(inserted.id)

    return res.status(201).json({
      success: true,
      message: payload.waitForCompletion
        ? 'Relação criada. Documento pai aguardando conclusão do(s) filho(s).'
        : 'Relação criada. Documento pai pode continuar o fluxo.',
      data: mapDocumentRelation(relation),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.createDocumentRelation] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar relação entre documentos.',
      error: error?.message ?? 'Erro interno',
      detail: error?.detail ?? null,
      hint: error?.hint ?? null,
      code: error?.code ?? null,
      table: error?.table ?? null,
      column: error?.column ?? null,
      constraint: error?.constraint ?? null,
    })
  }
}

export async function createDocumentRelationsBatch(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const body = req.body ?? {}

    const relations = Array.isArray(body.relations)
      ? body.relations
      : Array.isArray(body.items)
        ? body.items
        : []

    if (relations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'relations é obrigatório e deve conter ao menos um item.',
      })
    }

    const relationGroupId =
      normalizeUuid(body.relationGroupId ?? body.relation_group_id) ??
      randomUUID()

    const created: any[] = []

    for (const relationBody of relations) {
      const payload = buildRelationPayload(req, {
        ...relationBody,
        relationGroupId,
      })

      if (
        !payload.parentDocumentId ||
        !payload.parentDocumentInstanceId ||
        !payload.childDocumentId ||
        !payload.childDocumentInstanceId ||
        !payload.childProcessId
      ) {
        throw new Error(
          'Payload inválido no batch. Verifique parentDocumentId, parentDocumentInstanceId, childDocumentId, childDocumentInstanceId e childProcessId.',
        )
      }

      const parentDocument = await findDocumentById(payload.parentDocumentId)
      const parentInstance = await findDocumentInstanceById(
        payload.parentDocumentInstanceId,
      )

      if (!parentDocument || !parentInstance) {
        throw new Error('Documento ou instância pai não encontrada no batch.')
      }

      const accountId =
        getLoggedUser(req).accountId ??
        parentDocument.account_id ??
        parentInstance.account_id

      const inserted = await insertDocumentRelation({
        accountId,

        relationGroupId,

        parentDocumentId: payload.parentDocumentId,
        parentDocumentInstanceId: payload.parentDocumentInstanceId,

        childDocumentId: payload.childDocumentId,
        childDocumentInstanceId: payload.childDocumentInstanceId,

        relationType: payload.relationType,

        sourceTableMetadataDefinitionId:
          payload.sourceTableMetadataDefinitionId,
        sourceTableName: payload.sourceTableName,
        sourceRowKey: payload.sourceRowKey,
        sourceRowIndex: payload.sourceRowIndex,
        sourceRowValue: payload.sourceRowValue,

        parentProcessId: payload.parentProcessId ?? parentInstance.process_id,
        parentProcessName:
          payload.parentProcessName ?? parentInstance.process_name,

        childProcessId: payload.childProcessId,
        childProcessName: payload.childProcessName,

        childWorkflowId: payload.childWorkflowId,
        childWorkflowName: payload.childWorkflowName,

        waitForCompletion: payload.waitForCompletion,
        waitPolicy: payload.waitPolicy,

        parentWaitingElementId:
          payload.parentWaitingElementId ?? parentInstance.current_element_id,
        parentNextElementId: payload.parentNextElementId,

        createdById: payload.createdById,
        createdByName: payload.createdByName,
      })

      const fullRelation = await findRelationRawById(inserted.id)

      created.push(mapDocumentRelation(fullRelation))
    }

    return res.status(201).json({
      success: true,
      message: 'Relações criadas em lote com sucesso.',
      relationGroupId,
      data: created,
    })
  } catch (error: any) {
    console.error(
      '[documentRelationsController.createDocumentRelationsBatch] error =>',
      error,
    )

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar relações em lote.',
      error: error?.message ?? 'Erro interno',
      detail: error?.detail ?? null,
      hint: error?.hint ?? null,
      code: error?.code ?? null,
      table: error?.table ?? null,
      column: error?.column ?? null,
      constraint: error?.constraint ?? null,
    })
  }
}

export async function findDocumentRelationById(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = normalizeUuid(req.params.id)

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da relação é obrigatório.',
      })
    }

    const relation = await findRelationRawById(id)

    if (!relation) {
      return res.status(404).json({
        success: false,
        message: 'Relação não encontrada.',
      })
    }

    return res.status(200).json({
      success: true,
      data: mapDocumentRelation(relation),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.findDocumentRelationById] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar relação entre documentos.',
      error: error?.message ?? 'Erro interno',
    })
  }
}

export async function findDocumentRelationsByDocument(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const documentId = normalizeUuid(req.params.documentId)

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'documentId é obrigatório.',
      })
    }

    const direction = normalizeString(req.query.direction) ?? 'all'
    const relationType = normalizeString(req.query.relationType)
    const status = normalizeString(req.query.status)

    const params: any[] = [documentId]

    let where = `
      WHERE (
        dr.parent_document_id::text = $1::text
        OR dr.child_document_id::text = $1::text
      )
    `

    if (direction === 'children') {
      where = `
        WHERE dr.parent_document_id::text = $1::text
      `
    }

    if (direction === 'parent') {
      where = `
        WHERE dr.child_document_id::text = $1::text
      `
    }

    if (relationType) {
      params.push(relationType)
      where += ` AND dr.relation_type = $${params.length}`
    }

    if (status) {
      params.push(status)
      where += ` AND dr.status = $${params.length}`
    }

    const result = await db.query(
      `
      SELECT
        dr.*,

        pd.title AS parent_document_title,
        pd.code AS parent_document_code,

        cd.title AS child_document_title,
        cd.code AS child_document_code,

        pdi.revision AS parent_instance_revision,
        cdi.revision AS child_instance_revision,

        pdi.status AS parent_instance_status,
        cdi.status AS child_instance_status

      FROM document_relations dr

      INNER JOIN documents pd
        ON pd.id = dr.parent_document_id

      INNER JOIN documents cd
        ON cd.id = dr.child_document_id

      INNER JOIN document_instances pdi
        ON pdi.id = dr.parent_document_instance_id

      INNER JOIN document_instances cdi
        ON cdi.id = dr.child_document_instance_id

      ${where}

      ORDER BY dr.created_at DESC
      `,
      params,
    )

    return res.status(200).json({
      success: true,
      data: result.rows.map(mapDocumentRelation),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.findDocumentRelationsByDocument] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar relações do documento.',
      error: error?.message ?? 'Erro interno',
    })
  }
}

export async function findDocumentRelationsByInstance(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const documentInstanceId = normalizeUuid(req.params.documentInstanceId)

    if (!documentInstanceId) {
      return res.status(400).json({
        success: false,
        message: 'documentInstanceId é obrigatório.',
      })
    }

    const direction = normalizeString(req.query.direction) ?? 'all'

    let where = `
      WHERE (
        dr.parent_document_instance_id::text = $1::text
        OR dr.child_document_instance_id::text = $1::text
      )
    `

    if (direction === 'children') {
      where = `
        WHERE dr.parent_document_instance_id::text = $1::text
      `
    }

    if (direction === 'parent') {
      where = `
        WHERE dr.child_document_instance_id::text = $1::text
      `
    }

    const result = await db.query(
      `
      SELECT
        dr.*,

        pd.title AS parent_document_title,
        pd.code AS parent_document_code,

        cd.title AS child_document_title,
        cd.code AS child_document_code,

        pdi.revision AS parent_instance_revision,
        cdi.revision AS child_instance_revision,

        pdi.status AS parent_instance_status,
        cdi.status AS child_instance_status

      FROM document_relations dr

      INNER JOIN documents pd
        ON pd.id = dr.parent_document_id

      INNER JOIN documents cd
        ON cd.id = dr.child_document_id

      INNER JOIN document_instances pdi
        ON pdi.id = dr.parent_document_instance_id

      INNER JOIN document_instances cdi
        ON cdi.id = dr.child_document_instance_id

      ${where}

      ORDER BY dr.created_at DESC
      `,
      [documentInstanceId],
    )

    return res.status(200).json({
      success: true,
      data: result.rows.map(mapDocumentRelation),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.findDocumentRelationsByInstance] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar relações da instância.',
      error: error?.message ?? 'Erro interno',
    })
  }
}

export async function findParentRelationsWaitingForChild(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const childDocumentInstanceId = normalizeUuid(
      req.params.childDocumentInstanceId,
    )

    if (!childDocumentInstanceId) {
      return res.status(400).json({
        success: false,
        message: 'childDocumentInstanceId é obrigatório.',
      })
    }

    const result = await db.query(
      `
      SELECT
        dr.*,

        pd.title AS parent_document_title,
        pd.code AS parent_document_code,

        cd.title AS child_document_title,
        cd.code AS child_document_code,

        pdi.revision AS parent_instance_revision,
        cdi.revision AS child_instance_revision,

        pdi.status AS parent_instance_status,
        cdi.status AS child_instance_status

      FROM document_relations dr

      INNER JOIN documents pd
        ON pd.id = dr.parent_document_id

      INNER JOIN documents cd
        ON cd.id = dr.child_document_id

      INNER JOIN document_instances pdi
        ON pdi.id = dr.parent_document_instance_id

      INNER JOIN document_instances cdi
        ON cdi.id = dr.child_document_instance_id

      WHERE dr.child_document_instance_id::text = $1::text
        AND dr.wait_for_completion = true
        AND dr.status = 'waiting_child'

      ORDER BY dr.created_at ASC
      `,
      [childDocumentInstanceId],
    )

    return res.status(200).json({
      success: true,
      data: result.rows.map(mapDocumentRelation),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.findParentRelationsWaitingForChild] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar pais aguardando filho.',
      error: error?.message ?? 'Erro interno',
    })
  }
}

export async function updateDocumentRelationStatus(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = normalizeUuid(req.params.id)
    const status = normalizeString(req.body?.status) as DocumentRelationStatus

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da relação é obrigatório.',
      })
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status é obrigatório.',
      })
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status inválido. Valores permitidos: ${ALLOWED_STATUSES.join(
          ', ',
        )}.`,
      })
    }

    const result = await db.query(
      `
      UPDATE document_relations
      SET status = $1,
          updated_at = NOW()
      WHERE id::text = $2::text
      RETURNING *
      `,
      [status, id],
    )

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        success: false,
        message: 'Relação não encontrada.',
      })
    }

    const relation = await findRelationRawById(id)

    return res.status(200).json({
      success: true,
      message: 'Status da relação atualizado com sucesso.',
      data: mapDocumentRelation(relation),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.updateDocumentRelationStatus] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status da relação.',
      error: error?.message ?? 'Erro interno',
    })
  }
}

export async function cancelDocumentRelation(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = normalizeUuid(req.params.id)

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID da relação é obrigatório.',
      })
    }

    const relation = await findRelationRawById(id)

    if (!relation) {
      return res.status(404).json({
        success: false,
        message: 'Relação não encontrada.',
      })
    }

    await db.query(
      `
      UPDATE document_relations
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE id::text = $1::text
      `,
      [id],
    )

    if (
      relation.wait_for_completion === true &&
      relation.status === 'waiting_child'
    ) {
      await tryReleaseParentIfGroupCompleted({
        parentDocumentInstanceId: relation.parent_document_instance_id,
        relationGroupId: relation.relation_group_id,
      })
    }

    const updated = await findRelationRawById(id)

    return res.status(200).json({
      success: true,
      message: 'Relação cancelada com sucesso.',
      data: mapDocumentRelation(updated),
    })
  } catch (error: any) {
    console.error('[documentRelationsController.cancelDocumentRelation] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao cancelar relação.',
      error: error?.message ?? 'Erro interno',
    })
  }
}

async function tryReleaseParentIfGroupCompleted(params: {
  parentDocumentInstanceId: string
  relationGroupId: string
}) {
  const { parentDocumentInstanceId, relationGroupId } = params

  const pendingResult = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM document_relations
    WHERE parent_document_instance_id::text = $1::text
      AND relation_group_id::text = $2::text
      AND wait_for_completion = true
      AND status = 'waiting_child'
    `,
    [parentDocumentInstanceId, relationGroupId],
  )

  const pendingTotal = Number(pendingResult.rows[0]?.total ?? 0)

  if (pendingTotal > 0) {
    return {
      released: false,
      pendingTotal,
    }
  }

  const nextElementResult = await db.query(
    `
    SELECT parent_next_element_id
    FROM document_relations
    WHERE parent_document_instance_id::text = $1::text
      AND relation_group_id::text = $2::text
      AND parent_next_element_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [parentDocumentInstanceId, relationGroupId],
  )

  const parentNextElementId =
    nextElementResult.rows[0]?.parent_next_element_id ?? null

  await db.query(
    `
    UPDATE document_instances
    SET status = 'in_progress',
        current_element_id = COALESCE($2, current_element_id),
        updated_at = NOW()
    WHERE id::text = $1::text
      AND status = 'waiting_subprocess'
    `,
    [parentDocumentInstanceId, parentNextElementId],
  )

  await db.query(
    `
    UPDATE document_relations
    SET status = 'parent_continued',
        parent_continued_at = NOW(),
        updated_at = NOW()
    WHERE parent_document_instance_id::text = $1::text
      AND relation_group_id::text = $2::text
      AND wait_for_completion = true
      AND status = 'child_completed'
    `,
    [parentDocumentInstanceId, relationGroupId],
  )

  return {
    released: true,
    pendingTotal: 0,
  }
}

export async function releaseParentDocumentsWaitingForChild(params: {
  childDocumentInstanceId: string
}) {
  const { childDocumentInstanceId } = params

  const waitingResult = await db.query(
    `
    SELECT *
    FROM document_relations
    WHERE child_document_instance_id::text = $1::text
      AND wait_for_completion = true
      AND status = 'waiting_child'
    ORDER BY created_at ASC
    `,
    [childDocumentInstanceId],
  )

  const releasedRelations: any[] = []

  for (const relation of waitingResult.rows) {
    await db.query(
      `
      UPDATE document_relations
      SET status = 'child_completed',
          child_completed_at = NOW(),
          updated_at = NOW()
      WHERE id::text = $1::text
      `,
      [relation.id],
    )

    const releaseResult = await tryReleaseParentIfGroupCompleted({
      parentDocumentInstanceId: relation.parent_document_instance_id,
      relationGroupId: relation.relation_group_id,
    })

    const updated = await findRelationRawById(relation.id)

    releasedRelations.push({
      relation: mapDocumentRelation(updated),
      parentRelease: releaseResult,
    })
  }

  return releasedRelations
}

export async function markChildAsCompletedAndReleaseParent(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const childDocumentInstanceId = normalizeUuid(
      req.params.childDocumentInstanceId,
    )

    if (!childDocumentInstanceId) {
      return res.status(400).json({
        success: false,
        message: 'childDocumentInstanceId é obrigatório.',
      })
    }

    const released = await releaseParentDocumentsWaitingForChild({
      childDocumentInstanceId,
    })

    return res.status(200).json({
      success: true,
      message:
        released.length > 0
          ? 'Documento filho concluído. Relações processadas.'
          : 'Nenhum documento pai aguardando este filho.',
      data: released,
    })
  } catch (error: any) {
    console.error(
      '[documentRelationsController.markChildAsCompletedAndReleaseParent] error =>',
      error,
    )

    return res.status(500).json({
      success: false,
      message: 'Erro ao concluir filho e liberar pai.',
      error: error?.message ?? 'Erro interno',
    })
  }
}