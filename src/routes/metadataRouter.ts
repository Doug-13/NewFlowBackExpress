import { Router } from 'express';
import metadataController from '../controller/metadataController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// ── Valores por documento ──────────────────────────────────────────────────
router.get('/metadata/values/:documentId', authMiddleware, metadataController.getValues);
router.get('/metadataValues/by-document/:documentId', authMiddleware, metadataController.getValues);

router.post('/metadata/values/:documentId', authMiddleware, metadataController.saveValues);
router.post('/metadataValues/by-document/:documentId', authMiddleware, metadataController.saveValues);

// ── Definições ─────────────────────────────────────────────────────────────
router.get('/metadataDefinitions', authMiddleware, metadataController.findDefs);
router.get('/metadata/definitions', authMiddleware, metadataController.findDefs);

router.post('/metadataDefinitions', authMiddleware, metadataController.createDef);
router.post('/metadata/definitions', authMiddleware, metadataController.createDef);

router.put('/metadataDefinitions/:id', authMiddleware, metadataController.updateDef);
router.put('/metadata/definitions/:id', authMiddleware, metadataController.updateDef);

router.patch('/metadataDefinitions/:id', authMiddleware, metadataController.patchDef);
router.patch('/metadata/definitions/:id', authMiddleware, metadataController.patchDef);

router.delete('/metadataDefinitions/:id', authMiddleware, metadataController.removeDef);
router.delete('/metadata/definitions/:id', authMiddleware, metadataController.removeDef);

// ── Conjuntos ──────────────────────────────────────────────────────────────
router.get('/metadataSets', authMiddleware, metadataController.findSets);
router.get('/metadata/sets', authMiddleware, metadataController.findSets);

router.post('/metadataSets', authMiddleware, metadataController.createSet);
router.post('/metadata/sets', authMiddleware, metadataController.createSet);

router.put('/metadataSets/:id', authMiddleware, metadataController.updateSet);
router.put('/metadata/sets/:id', authMiddleware, metadataController.updateSet);

router.patch('/metadataSets/:id', authMiddleware, metadataController.patchSet);
router.patch('/metadata/sets/:id', authMiddleware, metadataController.patchSet);

router.delete('/metadataSets/:id', authMiddleware, metadataController.removeSet);
router.delete('/metadata/sets/:id', authMiddleware, metadataController.removeSet);

export default router;
