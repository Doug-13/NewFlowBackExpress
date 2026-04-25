import { Response } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../config/database'
import type { AuthenticatedRequest } from '../middleware/authMiddleware'

type UserRow = {
  id: string
  account_id?: string | null
  name: string
  email: string
  password_hash?: string
  role: string
  cpf?: string | null
  phone?: string | null
  photo_url?: string | null
  department?: string | null
  job_title?: string | null
  position?: string | null
  notes?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

function normalizeUser(row: UserRow) {
  return {
    id: row.id,
    accountId: row.account_id ?? null,
    name: row.name,
    email: row.email,
    role: row.role,
    cpf: row.cpf ?? undefined,
    phone: row.phone ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    department: row.department ?? undefined,
    jobTitle: row.job_title ?? undefined,
    position: row.position ?? undefined,
    isActive: row.is_active ?? true,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }
}

const usersController = {
  async findAll(req: AuthenticatedRequest, res: Response) {
    try {
      const accountId = req.user?.accountId

      if (!accountId) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const result = await pool.query(
        `
        SELECT
          id,
          account_id,
          name,
          email,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active,
          created_at,
          updated_at
        FROM users
        WHERE account_id = $1
        ORDER BY name ASC
        `,
        [accountId],
      )

      return res.status(200).json(
        result.rows.map((row) => normalizeUser(row as UserRow)),
      )
    } catch (error) {
      console.error('[USERS][FIND_ALL] error =>', error)
      return res.status(500).json({
        message: 'Erro ao buscar usuários.',
      })
    }
  },

  async findOne(req: AuthenticatedRequest, res: Response) {
    try {
      const accountId = req.user?.accountId
      const { id } = req.params

      if (!accountId) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const result = await pool.query(
        `
        SELECT
          id,
          account_id,
          name,
          email,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active,
          created_at,
          updated_at
        FROM users
        WHERE id = $1
          AND account_id = $2
        LIMIT 1
        `,
        [id, accountId],
      )

      const user = result.rows[0] as UserRow | undefined

      if (!user) {
        return res.status(404).json({
          message: 'Usuário não encontrado.',
        })
      }

      return res.status(200).json(normalizeUser(user))
    } catch (error) {
      console.error('[USERS][FIND_ONE] error =>', error)
      return res.status(500).json({
        message: 'Erro ao buscar usuário.',
      })
    }
  },

  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const userAccountId = req.user?.accountId

      if (!userAccountId) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const {
        accountId,
        name,
        email,
        password,
        role,
        cpf,
        phone,
        photoUrl,
        department,
        jobTitle,
        position,
        notes,
        isActive,
      } = req.body as {
        accountId?: string
        name?: string
        email?: string
        password?: string
        role?: string
        cpf?: string
        phone?: string
        photoUrl?: string
        department?: string
        jobTitle?: string
        position?: string
        notes?: string
        isActive?: boolean
      }

      if (accountId && accountId !== userAccountId) {
        return res.status(403).json({
          message: 'Você não pode criar usuário em outra organização.',
        })
      }

      if (!name || !email || !password || !role) {
        return res.status(400).json({
          message: 'accountId, name, email, password e role são obrigatórios.',
        })
      }

      const existingResult = await pool.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        LIMIT 1
        `,
        [email],
      )

      if (existingResult.rows.length > 0) {
        return res.status(409).json({
          message: 'Já existe um usuário com este e-mail.',
        })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const result = await pool.query(
        `
        INSERT INTO users (
          account_id,
          name,
          email,
          password_hash,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12,
          $13, NOW(), NOW()
        )
        RETURNING
          id,
          account_id,
          name,
          email,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active,
          created_at,
          updated_at
        `,
        [
          userAccountId,
          name,
          email,
          hashedPassword,
          role,
          cpf ?? null,
          phone ?? null,
          photoUrl ?? null,
          department ?? null,
          jobTitle ?? null,
          position ?? null,
          notes ?? null,
          typeof isActive === 'boolean' ? isActive : true,
        ],
      )

      return res.status(201).json(
        normalizeUser(result.rows[0] as UserRow),
      )
    } catch (error) {
      console.error('[USERS][CREATE] error =>', error)
      return res.status(500).json({
        message: 'Erro ao criar usuário.',
      })
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      const accountId = req.user?.accountId
      const { id } = req.params

      if (!accountId) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const {
        name,
        email,
        password,
        role,
        cpf,
        phone,
        photoUrl,
        department,
        jobTitle,
        position,
        notes,
        isActive,
      } = req.body as {
        name?: string
        email?: string
        password?: string
        role?: string
        cpf?: string
        phone?: string
        photoUrl?: string
        department?: string
        jobTitle?: string
        position?: string
        notes?: string
        isActive?: boolean
      }

      if (!name || !email || !role) {
        return res.status(400).json({
          message: 'name, email e role são obrigatórios.',
        })
      }

      const currentResult = await pool.query(
        `
        SELECT
          id,
          account_id,
          password_hash
        FROM users
        WHERE id = $1
          AND account_id = $2
        LIMIT 1
        `,
        [id, accountId],
      )

      const currentUser = currentResult.rows[0] as UserRow | undefined

      if (!currentUser) {
        return res.status(404).json({
          message: 'Usuário não encontrado.',
        })
      }

      const duplicateResult = await pool.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
          AND id <> $2
        LIMIT 1
        `,
        [email, id],
      )

      if (duplicateResult.rows.length > 0) {
        return res.status(409).json({
          message: 'Já existe outro usuário com este e-mail.',
        })
      }

      let passwordHash = currentUser.password_hash ?? ''

      if (password && password.trim()) {
        passwordHash = await bcrypt.hash(password, 10)
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          name = $1,
          email = $2,
          password_hash = $3,
          role = $4,
          cpf = $5,
          phone = $6,
          photo_url = $7,
          department = $8,
          job_title = $9,
          position = $10,
          notes = $11,
          is_active = $12,
          updated_at = NOW()
        WHERE id = $13
          AND account_id = $14
        RETURNING
          id,
          account_id,
          name,
          email,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active,
          created_at,
          updated_at
        `,
        [
          name,
          email,
          passwordHash,
          role,
          cpf ?? null,
          phone ?? null,
          photoUrl ?? null,
          department ?? null,
          jobTitle ?? null,
          position ?? null,
          notes ?? null,
          typeof isActive === 'boolean' ? isActive : true,
          id,
          accountId,
        ],
      )

      return res.status(200).json(
        normalizeUser(result.rows[0] as UserRow),
      )
    } catch (error) {
      console.error('[USERS][UPDATE] error =>', error)
      return res.status(500).json({
        message: 'Erro ao atualizar usuário.',
      })
    }
  },

  async patch(req: AuthenticatedRequest, res: Response) {
    try {
      const accountId = req.user?.accountId
      const { id } = req.params
      const payload = req.body as {
        name?: string
        email?: string
        password?: string
        role?: string
        cpf?: string
        phone?: string
        photoUrl?: string
        department?: string
        jobTitle?: string
        position?: string
        notes?: string
        isActive?: boolean
      }

      if (!accountId) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const currentResult = await pool.query(
        `
        SELECT
          id,
          account_id,
          name,
          email,
          password_hash,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active
        FROM users
        WHERE id = $1
          AND account_id = $2
        LIMIT 1
        `,
        [id, accountId],
      )

      const currentUser = currentResult.rows[0] as UserRow | undefined

      if (!currentUser) {
        return res.status(404).json({
          message: 'Usuário não encontrado.',
        })
      }

      const nextEmail = payload.email ?? currentUser.email

      if (payload.email) {
        const duplicateResult = await pool.query(
          `
          SELECT id
          FROM users
          WHERE email = $1
            AND id <> $2
          LIMIT 1
          `,
          [payload.email, id],
        )

        if (duplicateResult.rows.length > 0) {
          return res.status(409).json({
            message: 'Já existe outro usuário com este e-mail.',
          })
        }
      }

      let nextPasswordHash = currentUser.password_hash ?? ''

      if (payload.password && payload.password.trim()) {
        nextPasswordHash = await bcrypt.hash(payload.password, 10)
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          name = $1,
          email = $2,
          password_hash = $3,
          role = $4,
          cpf = $5,
          phone = $6,
          photo_url = $7,
          department = $8,
          job_title = $9,
          position = $10,
          notes = $11,
          is_active = $12,
          updated_at = NOW()
        WHERE id = $13
          AND account_id = $14
        RETURNING
          id,
          account_id,
          name,
          email,
          role,
          cpf,
          phone,
          photo_url,
          department,
          job_title,
          position,
          notes,
          is_active,
          created_at,
          updated_at
        `,
        [
          payload.name ?? currentUser.name,
          nextEmail,
          nextPasswordHash,
          payload.role ?? currentUser.role,
          payload.cpf ?? currentUser.cpf ?? null,
          payload.phone ?? currentUser.phone ?? null,
          payload.photoUrl ?? currentUser.photo_url ?? null,
          payload.department ?? currentUser.department ?? null,
          payload.jobTitle ?? currentUser.job_title ?? null,
          payload.position ?? currentUser.position ?? null,
          payload.notes ?? currentUser.notes ?? null,
          typeof payload.isActive === 'boolean'
            ? payload.isActive
            : (currentUser.is_active ?? true),
          id,
          accountId,
        ],
      )

      return res.status(200).json(
        normalizeUser(result.rows[0] as UserRow),
      )
    } catch (error) {
      console.error('[USERS][PATCH] error =>', error)
      return res.status(500).json({
        message: 'Erro ao atualizar parcialmente o usuário.',
      })
    }
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    try {
      const accountId = req.user?.accountId
      const { id } = req.params

      if (!accountId) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const result = await pool.query(
        `
        DELETE FROM users
        WHERE id = $1
          AND account_id = $2
        RETURNING id
        `,
        [id, accountId],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Usuário não encontrado.',
        })
      }

      return res.status(200).json({
        message: 'Usuário removido com sucesso.',
      })
    } catch (error) {
      console.error('[USERS][REMOVE] error =>', error)
      return res.status(500).json({
        message: 'Erro ao remover usuário.',
      })
    }
  },

  async getMemberships(_req: AuthenticatedRequest, res: Response) {
    return res.status(200).json([])
  },

  async getMembershipsAlt(req: AuthenticatedRequest, res: Response) {
    return usersController.getMemberships(req, res)
  },

  async createMembership(_req: AuthenticatedRequest, res: Response) {
    return res.status(201).json({})
  },

  async getAccountMemberships(_req: AuthenticatedRequest, res: Response) {
    return res.status(200).json([])
  },

  async getAccountMembershipsAlt(req: AuthenticatedRequest, res: Response) {
    return usersController.getAccountMemberships(req, res)
  },
}

export default usersController