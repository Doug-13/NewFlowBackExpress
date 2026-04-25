import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
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
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

type AccountRow = {
  id: string
  name: string
  code?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret'
const ACCESS_TOKEN_EXPIRES_IN = '1h'
const REFRESH_TOKEN_EXPIRES_IN = '7d'

function signAccessToken(user: {
  id: string
  name: string
  email: string
  role: string
  accountId?: string | null
}) {
  return jwt.sign(
    {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountId: user.accountId ?? null,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  )
}

function signRefreshToken(user: {
  id: string
  email: string
}) {
  return jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
  )
}

function normalizeUser(user: UserRow) {
  return {
    id: user.id,
    accountId: user.account_id ?? null,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.is_active ?? true,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
  }
}

function normalizeAccount(account: AccountRow | undefined | null) {
  if (!account) return null

  return {
    id: account.id,
    name: account.name,
    code: account.code ?? null,
    isActive: account.is_active ?? true,
    createdAt: account.created_at ?? null,
    updatedAt: account.updated_at ?? null,
  }
}

const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as {
        email?: string
        password?: string
      }

      if (!email || !password) {
        return res.status(400).json({
          message: 'E-mail e senha são obrigatórios.',
        })
      }

      const userResult = await pool.query(
        `
        SELECT
          id,
          account_id,
          name,
          email,
          password_hash,
          role,
          is_active,
          created_at,
          updated_at
        FROM users
        WHERE email = $1
        LIMIT 1
        `,
        [email],
      )

      const user = userResult.rows[0] as UserRow | undefined

      if (!user) {
        return res.status(401).json({
          message: 'Credenciais inválidas.',
        })
      }

      if (!user.is_active) {
        return res.status(403).json({
          message: 'Usuário inativo.',
        })
      }

      if (!user.password_hash) {
        return res.status(500).json({
          message: 'Usuário sem hash de senha cadastrado.',
        })
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash)

      if (!isPasswordValid) {
        return res.status(401).json({
          message: 'Credenciais inválidas.',
        })
      }

      let account: AccountRow | undefined

      if (user.account_id) {
        const accountResult = await pool.query(
          `
          SELECT
            id,
            name,
            code,
            is_active,
            created_at,
            updated_at
          FROM accounts
          WHERE id = $1
          LIMIT 1
          `,
          [user.account_id],
        )

        account = accountResult.rows[0] as AccountRow | undefined

        if (!account) {
          return res.status(403).json({
            message: 'Conta do usuário não encontrada.',
          })
        }

        if (!account.is_active) {
          return res.status(403).json({
            message: 'Conta do usuário está inativa.',
          })
        }
      }

      const accessToken = signAccessToken({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountId: user.account_id ?? null,
      })

      const refreshToken = signRefreshToken({
        id: user.id,
        email: user.email,
      })

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })

      return res.status(200).json({
        accessToken,
        user: normalizeUser(user),
        account: normalizeAccount(account),
        enabledModules: [],
      })
    } catch (error: any) {
      console.error('[AUTH][LOGIN] error =>', error)

      return res.status(500).json({
        message: 'Erro ao realizar login.',
        error: error.message,
      })
    }
  },

  async register(req: Request, res: Response) {
    try {
      const {
        accountId,
        name,
        email,
        password,
        role,
      } = req.body as {
        accountId?: string | null
        name?: string
        email?: string
        password?: string
        role?: string
      }

      if (!name || !email || !password) {
        return res.status(400).json({
          message: 'Nome, e-mail e senha são obrigatórios.',
        })
      }

      if (accountId) {
        const accountResult = await pool.query(
          `
          SELECT id, name, code, is_active, created_at, updated_at
          FROM accounts
          WHERE id = $1
          LIMIT 1
          `,
          [accountId],
        )

        const account = accountResult.rows[0] as AccountRow | undefined

        if (!account) {
          return res.status(400).json({
            message: 'Conta informada não encontrada.',
          })
        }

        if (!account.is_active) {
          return res.status(400).json({
            message: 'Conta informada está inativa.',
          })
        }
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

      const insertResult = await pool.query(
        `
        INSERT INTO users (
          account_id,
          name,
          email,
          password_hash,
          role,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING
          id,
          account_id,
          name,
          email,
          role,
          is_active,
          created_at,
          updated_at
        `,
        [
          accountId ?? null,
          name,
          email,
          hashedPassword,
          role ?? 'user',
          true,
        ],
      )

      const createdUser = insertResult.rows[0] as UserRow

      let account: AccountRow | undefined

      if (createdUser.account_id) {
        const accountResult = await pool.query(
          `
          SELECT
            id,
            name,
            code,
            is_active,
            created_at,
            updated_at
          FROM accounts
          WHERE id = $1
          LIMIT 1
          `,
          [createdUser.account_id],
        )

        account = accountResult.rows[0] as AccountRow | undefined
      }

      return res.status(201).json({
        user: normalizeUser(createdUser),
        account: normalizeAccount(account),
      })
    } catch (error: any) {
      console.error('[AUTH][REGISTER] error =>', error)

      return res.status(500).json({
        message: 'Erro ao registrar usuário.',
        error: error.message,
      })
    }
  },

  async getMe(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const userResult = await pool.query(
        `
        SELECT
          id,
          account_id,
          name,
          email,
          role,
          is_active,
          created_at,
          updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [req.user.id],
      )

      const user = userResult.rows[0] as UserRow | undefined

      if (!user) {
        return res.status(404).json({
          message: 'Usuário não encontrado.',
        })
      }

      let account: AccountRow | undefined

      if (user.account_id) {
        const accountResult = await pool.query(
          `
          SELECT
            id,
            name,
            code,
            is_active,
            created_at,
            updated_at
          FROM accounts
          WHERE id = $1
          LIMIT 1
          `,
          [user.account_id],
        )

        account = accountResult.rows[0] as AccountRow | undefined
      }

      return res.status(200).json({
        user: normalizeUser(user),
        account: normalizeAccount(account),
      })
    } catch (error: any) {
      console.error('[AUTH][ME] error =>', error)

      return res.status(500).json({
        message: 'Erro ao buscar usuário autenticado.',
        error: error.message,
      })
    }
  },

  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken as string | undefined

      if (!refreshToken) {
        return res.status(401).json({
          message: 'Refresh token não encontrado.',
        })
      }

      const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as {
        id: string
        email: string
        sub: string
      }

      const userResult = await pool.query(
        `
        SELECT
          id,
          account_id,
          name,
          email,
          role,
          is_active,
          created_at,
          updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [payload.id],
      )

      const user = userResult.rows[0] as UserRow | undefined

      if (!user) {
        return res.status(401).json({
          message: 'Usuário do refresh token não encontrado.',
        })
      }

      if (!user.is_active) {
        return res.status(403).json({
          message: 'Usuário inativo.',
        })
      }

      let account: AccountRow | undefined

      if (user.account_id) {
        const accountResult = await pool.query(
          `
          SELECT
            id,
            name,
            code,
            is_active,
            created_at,
            updated_at
          FROM accounts
          WHERE id = $1
          LIMIT 1
          `,
          [user.account_id],
        )

        account = accountResult.rows[0] as AccountRow | undefined

        if (!account) {
          return res.status(403).json({
            message: 'Conta do usuário não encontrada.',
          })
        }

        if (!account.is_active) {
          return res.status(403).json({
            message: 'Conta do usuário está inativa.',
          })
        }
      }

      const accessToken = signAccessToken({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountId: user.account_id ?? null,
      })

      return res.status(200).json({
        accessToken,
        user: normalizeUser(user),
        account: normalizeAccount(account),
        enabledModules: [],
      })
    } catch (error: any) {
      console.error('[AUTH][REFRESH] error =>', error)

      return res.status(401).json({
        message: 'Refresh token inválido ou expirado.',
        error: error.message,
      })
    }
  },

  async logout(req: Request, res: Response) {
    try {
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      })

      return res.status(200).json({
        message: 'Logout realizado com sucesso.',
      })
    } catch (error: any) {
      console.error('[AUTH][LOGOUT] error =>', error)

      return res.status(500).json({
        message: 'Erro ao realizar logout.',
        error: error.message,
      })
    }
  },
}

export default authController