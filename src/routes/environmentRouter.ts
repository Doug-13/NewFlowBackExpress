import { Router } from 'express';
import environmentController from '../controller/environmentController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Rota que o frontend usa
router.get('/tenants/:accountId/environment-configurations', authMiddleware, environmentController.get);
router.post('/tenants/:accountId/environment-configurations', authMiddleware, environmentController.save);
router.put('/tenants/:accountId/environment-configurations', authMiddleware, environmentController.update);

// Rota alternativa
router.get('/environment-settings', authMiddleware, environmentController.getAlt);
router.post('/environment-settings', authMiddleware, environmentController.saveAlt);

export default router;
