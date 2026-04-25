import { Response } from 'express'
import pool from '../config/database'
import type { AuthenticatedRequest } from '../middleware/authMiddleware'

const dashboardController = {
  async getSummary(req: AuthenticatedRequest, res: Response) {
    try {
      console.log('[DASHBOARD][SUMMARY] req.user =>', req.user)

      const accountId = req.user?.accountId

      if (!accountId) {
        console.log('[DASHBOARD][SUMMARY] accountId ausente no req.user')
        return res.status(401).json({
          message: 'Usuário não autenticado.',
        })
      }

      const usersResult = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM users
        WHERE account_id = $1
        `,
        [accountId],
      )

      console.log('[DASHBOARD][SUMMARY] usersResult =>', usersResult.rows)

      const processesResult = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM processes
        WHERE account_id = $1
        `,
        [accountId],
      )

      console.log('[DASHBOARD][SUMMARY] processesResult =>', processesResult.rows)

      const response = {
        totalDocuments: 0,
        totalPendingTasks: 0,
        totalApprovedDocuments: 0,
        totalRejectedDocuments: 0,
        totalUsers: usersResult.rows[0]?.total ?? 0,
        totalProcesses: processesResult.rows[0]?.total ?? 0,
      }

      console.log('[DASHBOARD][SUMMARY] response =>', response)

      return res.status(200).json(response)
    } catch (error) {
      console.error('[DASHBOARD][SUMMARY] error =>', error)
      return res.status(500).json({
        message: 'Erro ao buscar resumo do dashboard.',
      })
    }
  },
}

export default dashboardController