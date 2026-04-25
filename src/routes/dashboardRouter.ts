import { Router } from 'express'
import dashboardController from '../controller/dashboardController'
import { authMiddleware } from '../middleware/authMiddleware'

const router = Router()

router.get(
  '/dashboard/summary',
  (req, _res, next) => {
    console.log('[ROUTER] dashboard summary hit')
    next()
  },
  authMiddleware,
  dashboardController.getSummary,
)

export default router