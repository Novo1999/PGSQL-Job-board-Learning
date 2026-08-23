import express from 'express';
import {
  createSkill,
  deleteSkill,
  getSkillDemand,
  listSkills,
} from '../controllers/skillsController.js';

const router = express.Router();

// Literal paths MUST be registered before any '/:param' route. Express matches
// in declaration order, so a '/:id' registered first would swallow '/demand'
// and try to look up a skill whose id is the string "demand".
router.get('/demand', getSkillDemand);

router.get('/', listSkills);
router.post('/', createSkill);
router.delete('/:id', deleteSkill);

export default router;
