import express from 'express';
import { listCompanies } from '../controllers/companiesController.js';

const router = express.Router();

router.get('/', listCompanies);

export default router;
