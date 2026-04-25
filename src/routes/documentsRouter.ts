import { Router } from 'express';
import documentsController from '../controller/documentsController';
import { authMiddleware } from '../middleware/authMiddleware'

const router = Router();

router.get('/document-instances', authMiddleware, documentsController.findAll);
router.get('/document-instances/:id', authMiddleware, documentsController.findOne);
router.post('/document-instances', authMiddleware, documentsController.create);
router.post('/document-instances/:id/cancel', authMiddleware, documentsController.cancel);
router.patch('/document-instances/:id/cancel', authMiddleware, documentsController.cancelPatch);
router.delete('/document-instances/:id', authMiddleware, documentsController.remove);
router.post('/document-instances/:id/actions', authMiddleware, documentsController.executeAction);
router.get('/:id/instances', documentsController.findInstances)
router.get('/document-instances/:id/references', authMiddleware, documentsController.findReferences,)

export default router;