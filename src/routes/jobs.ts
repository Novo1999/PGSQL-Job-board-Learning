import express from 'express';
import {
  createJob,
  deleteJob,
  getJobById,
  listJobs,
  updateJob,
} from '../controllers/jobsController.js';

const router = express.Router();

router.get('/', listJobs);
router.get('/:id', getJobById);
router.post('/', createJob);
router.patch('/:id', updateJob);
router.delete('/:id', deleteJob);

export default router;
