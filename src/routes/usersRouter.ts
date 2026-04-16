import { Router } from 'express';
import usersController from '../controller/usersController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/users', authMiddleware, usersController.findAll);
router.get('/users/:id', authMiddleware, usersController.findOne);
router.post('/users', authMiddleware, usersController.create);
router.put('/users/:id', authMiddleware, usersController.update);
router.patch('/users/:id', authMiddleware, usersController.patch);
router.delete('/users/:id', authMiddleware, usersController.remove);

router.get('/userProcessMemberships', authMiddleware, usersController.getMemberships);
router.get('/user-process-memberships', authMiddleware, usersController.getMembershipsAlt);
router.post('/userProcessMemberships', authMiddleware, usersController.createMembership);

router.get('/userAccountMemberships', authMiddleware, usersController.getAccountMemberships);
router.get('/user-account-memberships', authMiddleware, usersController.getAccountMembershipsAlt);

export default router;
