import { Router } from 'express'
import { authMiddleware } from '../middleware/authMiddleware'
import {
  cancelDocumentRelation,
  createDocumentRelation,
  createDocumentRelationsBatch,
  findDocumentRelationById,
  findDocumentRelationsByDocument,
  findDocumentRelationsByInstance,
  findParentRelationsWaitingForChild,
  markChildAsCompletedAndReleaseParent,
  updateDocumentRelationStatus,
} from '../controller/documentRelationsController'

const router = Router()

router.get(
  '/document-relations/document/:documentId',
  authMiddleware,
  findDocumentRelationsByDocument,
)

router.get(
  '/document-relations/instance/:documentInstanceId',
  authMiddleware,
  findDocumentRelationsByInstance,
)

router.get(
  '/document-relations/waiting-child/:childDocumentInstanceId',
  authMiddleware,
  findParentRelationsWaitingForChild,
)

router.get(
  '/document-relations/:id',
  authMiddleware,
  findDocumentRelationById,
)

router.post(
  '/document-relations',
  authMiddleware,
  createDocumentRelation,
)

router.post(
  '/document-relations/batch',
  authMiddleware,
  createDocumentRelationsBatch,
)

router.patch(
  '/document-relations/:id/status',
  authMiddleware,
  updateDocumentRelationStatus,
)

router.patch(
  '/document-relations/:id/cancel',
  authMiddleware,
  cancelDocumentRelation,
)

router.post(
  '/document-relations/child/:childDocumentInstanceId/complete',
  authMiddleware,
  markChildAsCompletedAndReleaseParent,
)

export default router