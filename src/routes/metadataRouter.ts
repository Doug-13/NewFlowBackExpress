import { Router } from 'express'
import {
  getValues,
  getFieldsByDocumentStep,
  saveValues,
  findDefs,
  createDef,
  updateDef,
  patchDef,
  removeDef,
  findTableDefinitionsByProcess,
  findSets,
  createSet,
  updateSet,
  patchSet,
  removeSet,
} from '../controller/metadataController'
import { authMiddleware } from '../middleware/authMiddleware'

const router = Router()

router.get('/metadata/values/:documentId', authMiddleware, getValues)
router.get('/metadata/form-fields/:documentId', authMiddleware, getFieldsByDocumentStep)
router.get('/metadataValues/by-document/:documentId', authMiddleware, getValues)

router.post('/metadata/values/:documentId', authMiddleware, saveValues)
router.post('/metadataValues/by-document/:documentId', authMiddleware, saveValues)

router.get('/metadataDefinitions', authMiddleware, findDefs)
router.get('/metadata/definitions', authMiddleware, findDefs)

router.get('/metadata/table-definitions', authMiddleware, findTableDefinitionsByProcess)
router.get('/table-definitions', authMiddleware, findTableDefinitionsByProcess)

router.post('/metadataDefinitions', authMiddleware, createDef)
router.post('/metadata/definitions', authMiddleware, createDef)

router.put('/metadataDefinitions/:id', authMiddleware, updateDef)
router.put('/metadata/definitions/:id', authMiddleware, updateDef)

router.patch('/metadataDefinitions/:id', authMiddleware, patchDef)
router.patch('/metadata/definitions/:id', authMiddleware, patchDef)

router.delete('/metadataDefinitions/:id', authMiddleware, removeDef)
router.delete('/metadata/definitions/:id', authMiddleware, removeDef)

router.get('/metadataSets', authMiddleware, findSets)
router.get('/metadata/sets', authMiddleware, findSets)

router.post('/metadataSets', authMiddleware, createSet)
router.post('/metadata/sets', authMiddleware, createSet)

router.put('/metadataSets/:id', authMiddleware, updateSet)
router.put('/metadata/sets/:id', authMiddleware, updateSet)

router.patch('/metadataSets/:id', authMiddleware, patchSet)
router.patch('/metadata/sets/:id', authMiddleware, patchSet)

router.delete('/metadataSets/:id', authMiddleware, removeSet)
router.delete('/metadata/sets/:id', authMiddleware, removeSet)

export default router