import { Router } from 'express';
import tasksController from '../controller/tasksController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/tasks/my', authMiddleware, tasksController.findMy);
router.post('/tasks/:id/execute', authMiddleware, tasksController.execute);

export default router;
