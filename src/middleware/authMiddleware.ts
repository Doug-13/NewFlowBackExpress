import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JwtUserPayload } from '../types/authTypes';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    accountId: string;
    name: string;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Token não informado.',
      });
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido.',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        success: false,
        message: 'JWT_SECRET não configurado.',
      });
    }

    const decoded = jwt.verify(token, secret) as JwtUserPayload;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      accountId: decoded.accountId,
      name: decoded.name,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Não autorizado.',
    });
  }
}
