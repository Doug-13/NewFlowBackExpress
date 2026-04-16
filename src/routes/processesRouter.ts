import { Router } from 'express';
import processesController from '../controller/processesController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/processes', authMiddleware, processesController.findAll);
router.get('/processes/:id', authMiddleware, processesController.findOne);
router.post('/processes', authMiddleware, processesController.create);
router.put('/processes/:id', authMiddleware, processesController.update);
router.patch('/processes/:id', authMiddleware, processesController.patch);
router.delete('/processes/:id', authMiddleware, processesController.remove);

export default router;
