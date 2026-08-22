import express from 'express';
import {
  createApplication,
  deleteApplication,
  getApplicationById,
  listApplications,
  updateApplication,
} from '../controllers/applicationsController.js';

const router = express.Router();

router.get('/', listApplications);
router.get('/:id', getApplicationById);
router.post('/', createApplication);
router.patch('/:id', updateApplication);
router.delete('/:id', deleteApplication);

export default router;
