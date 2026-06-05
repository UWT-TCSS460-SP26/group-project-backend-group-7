import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { getMyRatings, getMyReviews, getMyVotes } from '../../controllers/Front_End_API/me';

const meRouter = Router();

meRouter.get('/ratings', requireAuth, getMyRatings);
meRouter.get('/reviews', requireAuth, getMyReviews);
meRouter.get('/votes', requireAuth, getMyVotes);

export { meRouter };
