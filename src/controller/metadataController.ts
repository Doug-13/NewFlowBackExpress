import { Request, Response } from 'express'
import db from '../config/database'
import type { AuthenticatedRequest } from '../middleware/authMiddleware'

type QueryValue = string | number | boolean | null | undefined

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

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

function normalizeJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)

      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function normalizeJsonValue(value: unknown) {
  if (value === undefined) return null

  return value
}

function mapMetadataDefinition(row: any) {
  return {
    id: row.id,

    accountId: row.account_id ?? row.accountId ?? null,

    name: row.name ?? '',
    label: row.label ?? '',

    fieldType: row.field_type ?? row.fieldType ?? 'text',
    maskType: row.mask_type ?? row.maskType ?? null,

    isRequired: row.is_required ?? row.isRequired ?? false,
    isActive: row.is_active ?? row.isActive ?? true,

    orderIndex: row.order_index ?? row.orderIndex ?? 0,

    metadataSetId: row.metadata_set_id ?? row.metadataSetId ?? null,
    metadataSetName: row.metadata_set_name ?? row.metadataSetName ?? '',

    documentTypeId: row.document_type_id ?? row.documentTypeId ?? null,

    multipleSelection:
      row.multiple_selection ?? row.multipleSelection ?? false,

    options: row.options ?? [],
    tableColumns: row.table_columns ?? row.tableColumns ?? [],

    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

function mapMetadataSet(row: any) {
  return {
    id: row.id,
    accountId: row.account_id ?? row.accountId ?? null,
    name: row.name ?? '',
    description: row.description ?? '',
    isActive: row.is_active ?? row.isActive ?? true,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

function mapMetadataValue(row: any) {
  return {
    id: row.id,

    documentInstanceId:
      row.document_instance_id ?? row.documentInstanceId ?? null,

    metadataDefinitionId:
      row.metadata_definition_id ?? row.metadataDefinitionId ?? null,

    accountId: row.account_id ?? row.accountId ?? null,
    processId: row.process_id ?? row.processId ?? null,

    name: row.name ?? '',
    label: row.label ?? '',

    fieldType: row.field_type ?? row.fieldType ?? 'text',
    maskType: row.mask_type ?? row.maskType ?? null,

    isRequired: row.is_required ?? row.isRequired ?? false,
    isReadOnly: row.is_read_only ?? row.isReadOnly ?? false,

    value: row.value ?? null,

    options: row.options ?? [],
    tableColumns: row.table_columns ?? row.tableColumns ?? [],

    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

function buildWhereClause(
  filters: Array<{
    enabled: boolean
    clause: (index: number) => string
    value: QueryValue
  }>,
) {
  const conditions: string[] = []
  const params: any[] = []

  filters.forEach((filter) => {
    if (!filter.enabled) return

    params.push(filter.value)
    conditions.push(filter.clause(params.length))
  })

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

async function getDocumentInstance(documentId: string) {
  const result = await db.query(
    `
    SELECT
      id,
      account_id,
      process_id,
      workflow_id,
      current_step_name,
      current_step_order_index,
      current_element_id
    FROM document_instances
    WHERE id::text = $1::text
    LIMIT 1
    `,
    [documentId],
  )

  return result.rows[0] ?? null
}

async function resolveCurrentElementId(documentRow: any) {
  if (documentRow.current_element_id) {
    return documentRow.current_element_id
  }

  if (documentRow.current_step_name && documentRow.workflow_id) {
    const currentStepConfigResult = await db.query(
      `
      SELECT
        element_id
      FROM workflow_activity_configs
      WHERE workflow_id::text = $1::text
        AND (
          element_name = $2
          OR element_id = $2
        )
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [documentRow.workflow_id, documentRow.current_step_name],
    )

    const foundElementId = currentStepConfigResult.rows[0]?.element_id

    if (foundElementId) return foundElementId
  }

  if (documentRow.workflow_id) {
    const firstConfigResult = await db.query(
      `
      SELECT
        element_id
      FROM workflow_activity_configs
      WHERE workflow_id::text = $1::text
      ORDER BY created_at ASC, element_id ASC
      LIMIT 1
      `,
      [documentRow.workflow_id],
    )

    const foundElementId = firstConfigResult.rows[0]?.element_id

    if (foundElementId) return foundElementId
  }

  if (documentRow.workflow_id) {
    const firstMetadataActivityResult = await db.query(
      `
      SELECT
        element_id
      FROM workflow_activity_metadata
      WHERE workflow_id::text = $1::text
      ORDER BY order_index ASC, element_id ASC
      LIMIT 1
      `,
      [documentRow.workflow_id],
    )

    const foundElementId = firstMetadataActivityResult.rows[0]?.element_id

    if (foundElementId) return foundElementId
  }

  return null
}

// ── Valores por documento ──────────────────────────────────────────────────

export async function getValues(req: Request, res: Response) {
  try {
    const { documentId } = req.params

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'documentId é obrigatório.',
      })
    }

    const result = await db.query(
      `
      SELECT
        mv.id,
        mv.document_instance_id,
        mv.metadata_definition_id,
        mv.account_id,
        mv.process_id,

        md.name,
        md.label,
        md.field_type,
        md.mask_type,
        md.is_required,
        md.options,
        md.table_columns,

        mv.value,
        mv.created_at,
        mv.updated_at
      FROM metadata_values mv
      INNER JOIN metadata_definitions md
        ON md.id::text = mv.metadata_definition_id::text
      WHERE mv.document_instance_id::text = $1::text
      ORDER BY
        COALESCE(md.order_index, 0) ASC,
        md.label ASC,
        md.name ASC
      `,
      [documentId],
    )

    return res.status(200).json(result.rows.map(mapMetadataValue))
  } catch (error: any) {
    console.error('[metadataController.getValues] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar metadados do documento.',
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

export async function getFieldsByDocumentStep(req: Request, res: Response) {
  try {
    const { documentId } = req.params

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'documentId é obrigatório.',
      })
    }

    const documentRow = await getDocumentInstance(documentId)

    if (!documentRow) {
      return res.status(404).json({
        success: false,
        message: 'Documento não encontrado.',
      })
    }

    if (!documentRow.workflow_id) {
      return res.status(200).json([])
    }

    const resolvedElementId = await resolveCurrentElementId(documentRow)

    if (!resolvedElementId) {
      return res.status(200).json([])
    }

    const result = await db.query(
      `
      SELECT
        mv.id,
        $1::text AS document_instance_id,
        wam.metadata_definition_id,
        $2::text AS account_id,
        $3::text AS process_id,

        md.name,
        md.label,
        md.field_type,
        md.mask_type,

        COALESCE(wam.is_required, md.is_required, false) AS is_required,
        COALESCE(wam.is_read_only, false) AS is_read_only,

        md.options,
        md.table_columns,

        mv.value,
        mv.created_at,
        mv.updated_at
      FROM workflow_activity_metadata wam
      INNER JOIN metadata_definitions md
        ON md.id::text = wam.metadata_definition_id::text
      LEFT JOIN metadata_values mv
        ON mv.document_instance_id::text = $1::text
       AND mv.metadata_definition_id::text = wam.metadata_definition_id::text
      WHERE wam.workflow_id::text = $4::text
        AND wam.element_id = $5
      ORDER BY
        COALESCE(wam.order_index, 0) ASC,
        COALESCE(md.order_index, 0) ASC,
        md.label ASC,
        md.name ASC
      `,
      [
        documentId,
        documentRow.account_id ?? null,
        documentRow.process_id ?? null,
        documentRow.workflow_id,
        resolvedElementId,
      ],
    )

    return res.status(200).json(result.rows.map(mapMetadataValue))
  } catch (error: any) {
    console.error('[metadataController.getFieldsByDocumentStep] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar campos da etapa atual.',
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

export async function saveValues(req: AuthenticatedRequest, res: Response) {
  try {
    const { documentId } = req.params
    const body = req.body ?? {}

    const values = Array.isArray(body)
      ? body
      : Array.isArray(body.values)
        ? body.values
        : Array.isArray(body.metadataValues)
          ? body.metadataValues
          : []

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'documentId é obrigatório.',
      })
    }

    const documentRow = await getDocumentInstance(documentId)

    if (!documentRow) {
      return res.status(404).json({
        success: false,
        message: 'Documento não encontrado.',
      })
    }

    console.log('[metadataController.saveValues] documentId =>', documentId)
    console.log('[metadataController.saveValues] values length =>', values.length)
    console.log(
      '[metadataController.saveValues] first value =>',
      values.length > 0 ? values[0] : null,
    )

    await db.query('BEGIN')

    try {
      await db.query(
        `
        DELETE FROM metadata_values
        WHERE document_instance_id::text = $1::text
        `,
        [documentId],
      )

      for (const item of values) {
        const metadataDefinitionId =
          item?.metadataDefinitionId ??
          item?.metadata_definition_id ??
          item?.definitionId ??
          item?.definition_id ??
          null

        if (!metadataDefinitionId) {
          continue
        }

        const rawValue =
          item?.value ?? item?.currentValue ?? item?.defaultValue ?? null

        await db.query(
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
            documentId,
            String(metadataDefinitionId),
            documentRow.account_id ?? req.user?.accountId ?? null,
            documentRow.process_id ?? null,
            JSON.stringify(normalizeJsonValue(rawValue)),
          ],
        )
      }

      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }

    const savedResult = await db.query(
      `
      SELECT
        mv.id,
        mv.document_instance_id,
        mv.metadata_definition_id,
        mv.account_id,
        mv.process_id,

        md.name,
        md.label,
        md.field_type,
        md.mask_type,
        md.is_required,
        md.options,
        md.table_columns,

        mv.value,
        mv.created_at,
        mv.updated_at
      FROM metadata_values mv
      INNER JOIN metadata_definitions md
        ON md.id::text = mv.metadata_definition_id::text
      WHERE mv.document_instance_id::text = $1::text
      ORDER BY
        COALESCE(md.order_index, 0) ASC,
        md.label ASC,
        md.name ASC
      `,
      [documentId],
    )

    return res.status(200).json({
      success: true,
      values: savedResult.rows.map(mapMetadataValue),
    })
  } catch (error: any) {
    console.error('[metadataController.saveValues] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar metadados do documento.',
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

// ── Definições ─────────────────────────────────────────────────────────────

export async function findDefs(req: AuthenticatedRequest, res: Response) {
  try {
    const q: any = req.query ?? {}

    const accountId = normalizeString(
      q.accountId ?? q.account_id ?? q.tenantId ?? req.user?.accountId,
    )
    const metadataSetId = normalizeString(
      q.metadataSetId ?? q.metadata_set_id,
    )
    const documentTypeId = normalizeString(
      q.documentTypeId ?? q.document_type_id,
    )
    const fieldType = normalizeString(q.fieldType ?? q.field_type)
    const processId = normalizeString(q.processId ?? q.process_id)

    const filters = buildWhereClause([
      {
        enabled: Boolean(accountId),
        clause: (index) => `account_id = $${index}`,
        value: accountId,
      },
      {
        enabled: Boolean(metadataSetId),
        clause: (index) => `metadata_set_id = $${index}`,
        value: metadataSetId,
      },
      {
        enabled: Boolean(documentTypeId),
        clause: (index) => `document_type_id = $${index}`,
        value: documentTypeId,
      },
      {
        enabled: Boolean(fieldType),
        clause: (index) => `LOWER(field_type) = $${index}`,
        value: fieldType?.toLowerCase(),
      },
    ])

    let query = `
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
      ${filters.whereClause}
      ORDER BY
        COALESCE(order_index, 0) ASC,
        label ASC,
        name ASC
    `

    let params = filters.params

    if (processId) {
      const processParams = [...filters.params, processId]

      const baseWhere = filters.whereClause
        ? `${filters.whereClause} AND`
        : 'WHERE'

      query = `
        SELECT DISTINCT
          md.id,
          md.account_id,
          md.name,
          md.label,
          md.field_type,
          md.mask_type,
          md.is_required,
          md.is_active,
          md.order_index,
          md.metadata_set_id,
          md.metadata_set_name,
          md.document_type_id,
          md.multiple_selection,
          md.options,
          md.table_columns,
          md.created_at,
          md.updated_at
        FROM metadata_definitions md
        LEFT JOIN metadata_values mv
          ON mv.metadata_definition_id::text = md.id::text
        ${baseWhere}
          mv.process_id::text = $${processParams.length}::text
        ORDER BY
          COALESCE(md.order_index, 0) ASC,
          md.label ASC,
          md.name ASC
      `

      params = processParams
    }

    const result = await db.query(query, params)

    return res.status(200).json(result.rows.map(mapMetadataDefinition))
  } catch (error: any) {
    console.error('[metadataController.findDefs] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar definições de metadados.',
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

export async function findTableDefinitionsByProcess(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const q: any = req.query ?? {}

    const processId = normalizeString(
      q.processId ?? q.process_id ?? req.params?.processId,
    )

    const accountId = normalizeString(
      q.accountId ?? q.account_id ?? q.tenantId ?? req.user?.accountId,
    )

    if (!processId) {
      return res.status(400).json({
        success: false,
        message: 'processId é obrigatório.',
      })
    }

    const params: any[] = [processId]

    let accountFilter = ''

    if (accountId) {
      params.push(accountId)
      accountFilter = `AND mv.account_id::text = $${params.length}::text`
    }

    console.log('[metadataController.findTableDefinitionsByProcess] params =>', {
      processId,
      accountId,
    })

    const result = await db.query(
      `
      SELECT
        md.id,
        md.account_id,
        md.name,
        md.label,
        md.field_type,
        md.mask_type,
        md.is_required,
        md.is_active,
        md.order_index,
        md.metadata_set_id,
        md.metadata_set_name,
        md.document_type_id,
        md.multiple_selection,
        md.options,
        md.table_columns,
        md.created_at,
        md.updated_at
      FROM metadata_definitions md
      WHERE EXISTS (
        SELECT 1
        FROM metadata_values mv
        WHERE mv.metadata_definition_id::text = md.id::text
          AND mv.process_id::text = $1::text
          ${accountFilter}
      )
      AND LOWER(COALESCE(md.field_type, '')) IN (
        'table',
        'tabela',
        'grid',
        'datatable',
        'data-table',
        'dynamic-table'
      )
      ORDER BY
        COALESCE(md.order_index, 0) ASC,
        md.label ASC,
        md.name ASC
      `,
      params,
    )

    const data = result.rows.map((row: any) => ({
      ...mapMetadataDefinition(row),
      processId,
    }))

    console.log('[metadataController.findTableDefinitionsByProcess] found =>', {
      count: data.length,
      data,
    })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    console.error(
      '[metadataController.findTableDefinitionsByProcess] error =>',
      error,
    )

    console.error(
      '[metadataController.findTableDefinitionsByProcess] detail =>',
      {
        message: error?.message,
        detail: error?.detail,
        hint: error?.hint,
        code: error?.code,
        table: error?.table,
        column: error?.column,
        constraint: error?.constraint,
        where: error?.where,
        schema: error?.schema,
      },
    )

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar metadados do tipo tabela por processo.',
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

export async function createDef(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body ?? {}

    const accountId = normalizeString(
      body.accountId ?? body.account_id ?? req.user?.accountId,
    )
    const name = normalizeString(body.name)
    const label = normalizeString(body.label)
    const fieldType =
      normalizeString(body.fieldType ?? body.field_type) ?? 'text'
    const maskType = normalizeString(body.maskType ?? body.mask_type)
    const metadataSetId = normalizeString(
      body.metadataSetId ?? body.metadata_set_id,
    )
    const metadataSetName = normalizeString(
      body.metadataSetName ?? body.metadata_set_name,
    )
    const documentTypeId = normalizeString(
      body.documentTypeId ?? body.document_type_id,
    )

    const isRequired = normalizeBoolean(
      body.isRequired ?? body.is_required,
      false,
    )
    const isActive = normalizeBoolean(body.isActive ?? body.is_active, true)
    const orderIndex = normalizeNumber(body.orderIndex ?? body.order_index, 0)
    const multipleSelection = normalizeBoolean(
      body.multipleSelection ?? body.multiple_selection,
      false,
    )

    const options = normalizeJsonArray(body.options)
    const tableColumns = normalizeJsonArray(
      body.tableColumns ?? body.table_columns,
    )

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId é obrigatório.',
      })
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'name é obrigatório.',
      })
    }

    if (!label) {
      return res.status(400).json({
        success: false,
        message: 'label é obrigatório.',
      })
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
        table_columns,
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
        $12,
        $13::jsonb,
        $14::jsonb,
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        accountId,
        name,
        label,
        fieldType,
        maskType,
        isRequired,
        isActive,
        orderIndex,
        metadataSetId,
        metadataSetName,
        documentTypeId,
        multipleSelection,
        JSON.stringify(options),
        JSON.stringify(tableColumns),
      ],
    )

    return res.status(201).json({
      success: true,
      data: mapMetadataDefinition(result.rows[0]),
    })
  } catch (error: any) {
    console.error('[metadataController.createDef] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar definição de metadado.',
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

export async function updateDef(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params
    const body = req.body ?? {}

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'id é obrigatório.',
      })
    }

    const currentResult = await db.query(
      `
      SELECT *
      FROM metadata_definitions
      WHERE id::text = $1::text
      LIMIT 1
      `,
      [id],
    )

    if ((currentResult.rowCount ?? 0) === 0) {
      return res.status(404).json({
        success: false,
        message: 'Definição de metadado não encontrada.',
      })
    }

    const current = currentResult.rows[0]

    const name = normalizeString(body.name) ?? current.name
    const label = normalizeString(body.label) ?? current.label
    const fieldType =
      normalizeString(body.fieldType ?? body.field_type) ??
      current.field_type ??
      'text'
    const maskType =
      normalizeString(body.maskType ?? body.mask_type) ?? current.mask_type
    const metadataSetId =
      normalizeString(body.metadataSetId ?? body.metadata_set_id) ??
      current.metadata_set_id
    const metadataSetName =
      normalizeString(body.metadataSetName ?? body.metadata_set_name) ??
      current.metadata_set_name
    const documentTypeId =
      normalizeString(body.documentTypeId ?? body.document_type_id) ??
      current.document_type_id

    const isRequired =
      body.isRequired !== undefined || body.is_required !== undefined
        ? normalizeBoolean(body.isRequired ?? body.is_required, false)
        : Boolean(current.is_required)

    const isActive =
      body.isActive !== undefined || body.is_active !== undefined
        ? normalizeBoolean(body.isActive ?? body.is_active, true)
        : Boolean(current.is_active)

    const orderIndex =
      body.orderIndex !== undefined || body.order_index !== undefined
        ? normalizeNumber(body.orderIndex ?? body.order_index, 0)
        : Number(current.order_index ?? 0)

    const multipleSelection =
      body.multipleSelection !== undefined ||
        body.multiple_selection !== undefined
        ? normalizeBoolean(
          body.multipleSelection ?? body.multiple_selection,
          false,
        )
        : Boolean(current.multiple_selection)

    const options =
      body.options !== undefined
        ? normalizeJsonArray(body.options)
        : current.options ?? []

    const tableColumns =
      body.tableColumns !== undefined || body.table_columns !== undefined
        ? normalizeJsonArray(body.tableColumns ?? body.table_columns)
        : current.table_columns ?? []

    const result = await db.query(
      `
      UPDATE metadata_definitions
      SET
        name = $1,
        label = $2,
        field_type = $3,
        mask_type = $4,
        is_required = $5,
        is_active = $6,
        order_index = $7,
        metadata_set_id = $8,
        metadata_set_name = $9,
        document_type_id = $10,
        multiple_selection = $11,
        options = $12::jsonb,
        table_columns = $13::jsonb,
        updated_at = NOW()
      WHERE id::text = $14::text
      RETURNING *
      `,
      [
        name,
        label,
        fieldType,
        maskType,
        isRequired,
        isActive,
        orderIndex,
        metadataSetId,
        metadataSetName,
        documentTypeId,
        multipleSelection,
        JSON.stringify(options),
        JSON.stringify(tableColumns),
        id,
      ],
    )

    return res.status(200).json({
      success: true,
      data: mapMetadataDefinition(result.rows[0]),
    })
  } catch (error: any) {
    console.error('[metadataController.updateDef] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar definição de metadado.',
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

export async function patchDef(req: AuthenticatedRequest, res: Response) {
  return updateDef(req, res)
}

export async function removeDef(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'id é obrigatório.',
      })
    }

    await db.query(
      `
      DELETE FROM metadata_definitions
      WHERE id::text = $1::text
      `,
      [id],
    )

    return res.status(200).json({
      success: true,
      message: 'Definição de metadado removida com sucesso.',
    })
  } catch (error: any) {
    console.error('[metadataController.removeDef] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao remover definição de metadado.',
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

// ── Conjuntos ──────────────────────────────────────────────────────────────

export async function findSets(req: AuthenticatedRequest, res: Response) {
  try {
    const q: any = req.query ?? {}

    const accountId = normalizeString(
      q.accountId ?? q.account_id ?? q.tenantId ?? req.user?.accountId,
    )

    const filters = buildWhereClause([
      {
        enabled: Boolean(accountId),
        clause: (index) => `account_id = $${index}`,
        value: accountId,
      },
    ])

    const result = await db.query(
      `
      SELECT
        id,
        account_id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      FROM metadata_sets
      ${filters.whereClause}
      ORDER BY name ASC
      `,
      filters.params,
    )

    return res.status(200).json(result.rows.map(mapMetadataSet))
  } catch (error: any) {
    console.error('[metadataController.findSets] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar conjuntos de metadados.',
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

export async function createSet(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body ?? {}

    const accountId = normalizeString(
      body.accountId ?? body.account_id ?? req.user?.accountId,
    )
    const name = normalizeString(body.name)
    const description = normalizeString(body.description)
    const isActive = normalizeBoolean(body.isActive ?? body.is_active, true)

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'accountId é obrigatório.',
      })
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'name é obrigatório.',
      })
    }

    const result = await db.query(
      `
      INSERT INTO metadata_sets (
        account_id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [accountId, name, description, isActive],
    )

    return res.status(201).json({
      success: true,
      data: mapMetadataSet(result.rows[0]),
    })
  } catch (error: any) {
    console.error('[metadataController.createSet] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar conjunto de metadados.',
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

export async function updateSet(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params
    const body = req.body ?? {}

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'id é obrigatório.',
      })
    }

    const currentResult = await db.query(
      `
      SELECT *
      FROM metadata_sets
      WHERE id::text = $1::text
      LIMIT 1
      `,
      [id],
    )

    if ((currentResult.rowCount ?? 0) === 0) {
      return res.status(404).json({
        success: false,
        message: 'Conjunto de metadados não encontrado.',
      })
    }

    const current = currentResult.rows[0]

    const name = normalizeString(body.name) ?? current.name
    const description =
      normalizeString(body.description) ?? current.description
    const isActive =
      body.isActive !== undefined || body.is_active !== undefined
        ? normalizeBoolean(body.isActive ?? body.is_active, true)
        : Boolean(current.is_active)

    const result = await db.query(
      `
      UPDATE metadata_sets
      SET
        name = $1,
        description = $2,
        is_active = $3,
        updated_at = NOW()
      WHERE id::text = $4::text
      RETURNING *
      `,
      [name, description, isActive, id],
    )

    return res.status(200).json({
      success: true,
      data: mapMetadataSet(result.rows[0]),
    })
  } catch (error: any) {
    console.error('[metadataController.updateSet] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar conjunto de metadados.',
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

export async function patchSet(req: AuthenticatedRequest, res: Response) {
  return updateSet(req, res)
}

export async function removeSet(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'id é obrigatório.',
      })
    }

    await db.query(
      `
      DELETE FROM metadata_sets
      WHERE id::text = $1::text
      `,
      [id],
    )

    return res.status(200).json({
      success: true,
      message: 'Conjunto de metadados removido com sucesso.',
    })
  } catch (error: any) {
    console.error('[metadataController.removeSet] error =>', error)

    return res.status(500).json({
      success: false,
      message: 'Erro ao remover conjunto de metadados.',
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