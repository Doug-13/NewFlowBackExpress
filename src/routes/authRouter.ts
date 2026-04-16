import { Router } from 'express';
import authController from '../controller/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);
router.get('/auth/me', authMiddleware, authController.getMe);
router.post('/auth/logout', authController.logout);

export default router;
