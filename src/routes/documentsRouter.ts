import { Router } from 'express';
import documentsController from '../controller/documentsController';

const router = Router();

router.get('/document-instances', documentsController.findAll);
router.get('/document-instances/:id', documentsController.findOne);
router.post('/document-instances', documentsController.create);
router.post('/document-instances/:id/cancel', documentsController.cancel);
router.patch('/document-instances/:id/cancel', documentsController.cancelPatch);
router.delete('/document-instances/:id', documentsController.remove);

export default router;
