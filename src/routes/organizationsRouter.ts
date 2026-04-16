import { Router } from 'express';
import organizationsController from '../controller/organizationsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// ── Unidades ───────────────────────────────────────────────────────────────
router.get('/organizationUnits', authMiddleware, organizationsController.getUnits);
router.get('/organization/units', authMiddleware, organizationsController.getUnits);
router.post('/organizationUnits', authMiddleware, organizationsController.createUnit);
router.post('/organization/units', authMiddleware, organizationsController.createUnit);
router.put('/organizationUnits/:id', authMiddleware, organizationsController.updateUnit);
router.put('/organization/units/:id', authMiddleware, organizationsController.updateUnit);
router.patch('/organizationUnits/:id', authMiddleware, organizationsController.patchUnit);
router.patch('/organization/units/:id', authMiddleware, organizationsController.patchUnit);
router.delete('/organizationUnits/:id', authMiddleware, organizationsController.removeUnit);
router.delete('/organization/units/:id', authMiddleware, organizationsController.removeUnit);

// ── Áreas ──────────────────────────────────────────────────────────────────
router.get('/organizationAreas', authMiddleware, organizationsController.getAreas);
router.get('/organization/areas', authMiddleware, organizationsController.getAreas);
router.post('/organizationAreas', authMiddleware, organizationsController.createArea);
router.post('/organization/areas', authMiddleware, organizationsController.createArea);
router.put('/organizationAreas/:id', authMiddleware, organizationsController.updateArea);
router.put('/organization/areas/:id', authMiddleware, organizationsController.updateArea);
router.patch('/organizationAreas/:id', authMiddleware, organizationsController.patchArea);
router.patch('/organization/areas/:id', authMiddleware, organizationsController.patchArea);
router.delete('/organizationAreas/:id', authMiddleware, organizationsController.removeArea);
router.delete('/organization/areas/:id', authMiddleware, organizationsController.removeArea);

// ── Funções ────────────────────────────────────────────────────────────────
router.get('/organizationRoles', authMiddleware, organizationsController.getRoles);
router.get('/organization/roles', authMiddleware, organizationsController.getRoles);
router.post('/organizationRoles', authMiddleware, organizationsController.createRole);
router.post('/organization/roles', authMiddleware, organizationsController.createRole);
router.put('/organizationRoles/:id', authMiddleware, organizationsController.updateRole);
router.put('/organization/roles/:id', authMiddleware, organizationsController.updateRole);
router.patch('/organizationRoles/:id', authMiddleware, organizationsController.patchRole);
router.patch('/organization/roles/:id', authMiddleware, organizationsController.patchRole);
router.delete('/organizationRoles/:id', authMiddleware, organizationsController.removeRole);
router.delete('/organization/roles/:id', authMiddleware, organizationsController.removeRole);

// ── Disciplinas ────────────────────────────────────────────────────────────
router.get('/organizationDisciplines', authMiddleware, organizationsController.getDisciplines);
router.get('/organization/disciplines', authMiddleware, organizationsController.getDisciplines);
router.post('/organizationDisciplines', authMiddleware, organizationsController.createDiscipline);
router.post('/organization/disciplines', authMiddleware, organizationsController.createDiscipline);
router.put('/organizationDisciplines/:id', authMiddleware, organizationsController.updateDiscipline);
router.put('/organization/disciplines/:id', authMiddleware, organizationsController.updateDiscipline);
router.patch('/organizationDisciplines/:id', authMiddleware, organizationsController.patchDiscipline);
router.patch('/organization/disciplines/:id', authMiddleware, organizationsController.patchDiscipline);
router.delete('/organizationDisciplines/:id', authMiddleware, organizationsController.removeDiscipline);
router.delete('/organization/disciplines/:id', authMiddleware, organizationsController.removeDiscipline);

// ── Grupos ─────────────────────────────────────────────────────────────────
router.get('/organizationGroups', authMiddleware, organizationsController.getGroups);
router.get('/organization/groups', authMiddleware, organizationsController.getGroups);
router.post('/organizationGroups', authMiddleware, organizationsController.createGroup);
router.post('/organization/groups', authMiddleware, organizationsController.createGroup);
router.put('/organizationGroups/:id', authMiddleware, organizationsController.updateGroup);
router.put('/organization/groups/:id', authMiddleware, organizationsController.updateGroup);
router.patch('/organizationGroups/:id', authMiddleware, organizationsController.patchGroup);
router.patch('/organization/groups/:id', authMiddleware, organizationsController.patchGroup);
router.delete('/organizationGroups/:id', authMiddleware, organizationsController.removeGroup);
router.delete('/organization/groups/:id', authMiddleware, organizationsController.removeGroup);

export default router;
