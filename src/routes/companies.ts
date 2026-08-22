import express from 'express';
import {
  createCompany,
  deleteCompany,
  getCompanyById,
  listCompanies,
  updateCompany,
} from '../controllers/companiesController.js';

const router = express.Router();

router.get('/', listCompanies);
router.get('/:id', getCompanyById);
router.post('/', createCompany);
router.patch('/:id', updateCompany);
router.delete('/:id', deleteCompany);

export default router;
