import express from 'express';
import {
  createCompany,
  deleteCompany,
  getCompanyById,
  getCompanyFunnel,
  getCompanySalaryBands,
  getTopHiringCompanies,
  listCompanies,
  listCompanyJobs,
  updateCompany,
} from '../controllers/companiesController.js';

const router = express.Router();

// Literal paths first — see the note in routes/jobs.ts.
router.get('/top', getTopHiringCompanies);

router.get('/', listCompanies);
router.post('/', createCompany);

router.get('/:id', getCompanyById);
router.patch('/:id', updateCompany);
router.delete('/:id', deleteCompany);

router.get('/:id/jobs', listCompanyJobs);
router.get('/:id/funnel', getCompanyFunnel);
router.get('/:id/salary-bands', getCompanySalaryBands);

export default router;
