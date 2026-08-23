import express from 'express';
import {
  getApplicationsOverTime,
  getConversionRates,
  getOverview,
  getSalaryBenchmarks,
  getTimeToHire,
  getTopJobsPerCompany,
} from '../controllers/analyticsController.js';

const router = express.Router();

// Every route here is read-only and every path is literal, so ordering is not a
// concern in this router.
router.get('/overview', getOverview);
router.get('/salary-benchmarks', getSalaryBenchmarks);
router.get('/applications-over-time', getApplicationsOverTime);
router.get('/top-jobs-per-company', getTopJobsPerCompany);
router.get('/conversion', getConversionRates);
router.get('/time-to-hire', getTimeToHire);

export default router;
