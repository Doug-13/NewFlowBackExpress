import { Router } from 'express';
import workflowController from '../controller/workflowController';

const router = Router();

router.post('/workflow/start', workflowController.startWorkflow);
router.post('/workflow/transition', workflowController.executeTransition);
router.get('/workflow/history/:documentId', workflowController.getWorkflowHistory);

export default router;
