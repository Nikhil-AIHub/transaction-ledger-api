import { Router } from 'express';
import accountRoutes from './account.routes.js';
import transferRoutes from './transfer.routes.js';

const router = Router();

router.use('/accounts', accountRoutes);
router.use('/transfers', transferRoutes);

export default router;
