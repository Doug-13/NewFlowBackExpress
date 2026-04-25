import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    name?: string
    email?: string
    role?: string
    accountId?: string | null
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    console.log('[AUTH] Authorization =>', req.headers.authorization)

    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AUTH] token ausente ou inválido')
      return res.status(401).json({
        message: 'Token não informado.',
      })
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const payload = jwt.verify(token, JWT_SECRET) as {
      sub?: string
      id?: string
      name?: string
      email?: string
      role?: string
      accountId?: string | null
    }

    console.log('[AUTH] payload =>', payload)

    req.user = {
      id: String(payload.id ?? payload.sub ?? ''),
      name: payload.name,
      email: payload.email,
      role: payload.role,
      accountId: payload.accountId ?? null,
    }

    console.log('[AUTH] req.user =>', req.user)

    if (!req.user.id) {
      console.log('[AUTH] payload sem id/sub')
      return res.status(401).json({
        message: 'Token inválido.',
      })
    }

    next()
  } catch (error) {
    console.error('[AUTH] error =>', error)
    return res.status(401).json({
      message: 'Token inválido ou expirado.',
    })
  }
}