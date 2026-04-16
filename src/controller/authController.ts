import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { LoginDto, RegisterDto } from '../types/authTypes';
import { buildAuthResponse } from '../utils/authResponse';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

function signToken(payload: {
  sub: string;
  email: string;
  role: string;
  accountId: string;
  name: string;
}) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET não configurado.');
  }

  return jwt.sign(payload, secret, {
    expiresIn: '1d',
  });
}

async function login(req: Request, res: Response) {
  try {
    const dto = req.body as LoginDto;

    const result = await db.query(
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
      [dto.email],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas',
      });
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      accountId: user.account_id,
      name: user.name,
    };

    const token = signToken(payload);

    return res.json(buildAuthResponse(user, token));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao realizar login.',
      error: error.message,
    });
  }
}

async function register(req: Request, res: Response) {
  try {
    const dto = req.body as RegisterDto;

    const existing = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [dto.email],
    );

    if (existing.rows.length > 0) {
      return res.status(401).json({
        success: false,
        message: 'Email já cadastrado',
      });
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const created = await db.query(
      `
      INSERT INTO users (
        account_id,
        name,
        email,
        password_hash,
        role,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
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
        dto.accountId,
        dto.name,
        dto.email,
        hash,
        dto.role ?? 'user',
        true,
      ],
    );

    const user = created.rows[0];

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      accountId: user.account_id,
      name: user.name,
    };

    const token = signToken(payload);

    return res.status(201).json(buildAuthResponse(user, token));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao registrar usuário.',
      error: error.message,
    });
  }
}

async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
      });
    }

    const result = await db.query(
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
      [userId],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      accountId: user.account_id,
      name: user.name,
    };

    const token = signToken(payload);

    return res.json(buildAuthResponse(user, token));
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuário autenticado.',
      error: error.message,
    });
  }
}

async function logout(req: Request, res: Response) {
  return res.json({
    success: true,
  });
}

export default {
  login,
  register,
  getMe,
  logout,
};
