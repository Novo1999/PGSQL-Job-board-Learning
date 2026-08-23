import express from 'express';
import {
  applyToJob,
  bulkRejectApplications,
  deleteApplication,
  getApplicationById,
  getApplicationFunnel,
  getApplicationTimeline,
  listApplications,
  updateApplicationStatus,
  withdrawApplication,
} from '../controllers/applicationsController.js';

const router = express.Router();

// Literal paths first — see the note in routes/jobs.ts.
router.get('/funnel', getApplicationFunnel);
router.post('/bulk-reject', bulkRejectApplications);

router.get('/', listApplications);
router.post('/', applyToJob);

router.get('/:id', getApplicationById);
router.delete('/:id', deleteApplication);
router.get('/:id/timeline', getApplicationTimeline);

// Pipeline moves.
router.patch('/:id/status', updateApplicationStatus);
router.post('/:id/withdraw', withdrawApplication);

export default router;
