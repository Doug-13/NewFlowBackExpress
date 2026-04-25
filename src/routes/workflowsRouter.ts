import { Router } from 'express';
import workflowsController from '../controller/workflowsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();


// router.post('/workflows', authMiddleware, workflowsController.create);
// router.put('/workflows/:id', authMiddleware, workflowsController.update);
// router.patch('/workflows/:id', authMiddleware, workflowsController.patch);
// router.delete('/workflows/:id', authMiddleware, workflowsController.remove);
router.get('/workflows', authMiddleware, workflowsController.findAll);
router.get('/workflows/:id', authMiddleware, workflowsController.findOne);
router.post('/workflows', authMiddleware, workflowsController.saveWorkflow);
router.patch('/workflows/:id', authMiddleware, workflowsController.saveWorkflow);

export default router;
