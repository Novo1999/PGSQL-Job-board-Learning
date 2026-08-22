import express from 'express';
import { listApplications } from '../controllers/applicationsController.js';

const router = express.Router();

router.get('/', listApplications);

export default router;
