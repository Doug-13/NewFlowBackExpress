import { Router } from 'express';
import notificationsController from '../controller/notificationsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/notificationTemplates', authMiddleware, notificationsController.findAll);
router.get('/notificationTemplates/:id', authMiddleware, notificationsController.findOne);
router.post('/notificationTemplates', authMiddleware, notificationsController.create);
router.put('/notificationTemplates/:id', authMiddleware, notificationsController.update);
router.delete('/notificationTemplates/:id', authMiddleware, notificationsController.remove);

export default router;
