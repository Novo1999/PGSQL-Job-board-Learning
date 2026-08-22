import express from 'express';
import { getJobById, listJobs } from '../controllers/jobsController.js';

const router = express.Router();

router.get('/', listJobs);
router.get('/jobs/:id', getJobById);

export default router;
