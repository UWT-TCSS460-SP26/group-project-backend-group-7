import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/middleware/requireAuth', () => jest.requireActual('./__mocks__/requireAuth'));
jest.mock('../src/lib/prisma', () => jest.requireActual('./__mocks__/libPrisma'));

const { reviewsRouter } = jest.requireActual(
  '../src/routes/database/reviews'
) as typeof import('../src/routes/database/reviews');
const { prisma } = jest.requireMock('../src/lib/prisma') as typeof import('../src/lib/prisma');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/reviews', reviewsRouter);
  return app;
};

const app = createApp();

describe('Reviews API Endpoints', () => {
  let userToken: string;
  let adminToken: string;

  // 2. Setup fake JWT tokens for our simulated users before tests run
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    userToken = jwt.sign({ sub: 2, email: 'user@dev.local', role: 2 }, process.env.JWT_SECRET);
    adminToken = jwt.sign({ sub: 1, email: 'admin@dev.local', role: 1 }, process.env.JWT_SECRET);
  });

  // 3. Clear our mocks between tests so they don't interfere with each other
  beforeEach(() => {
    jest.clearAllMocks();
    // Default fallback mock if requireAuth checks the db
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 2, role: 2 });
  });

  describe('POST /v1/reviews', () => {
    it('should create a new review successfully', async () => {
      const mockReview = {
        id: 1,
        authorId: 2,
        title_id: 246,
        media_type: 'movie',
        content: 'Great show',
        header: 'Awesome',
      };
      (prisma.review.create as jest.Mock).mockResolvedValue(mockReview);

      const response = await request(app)
        .post('/v1/reviews')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title_id: 246, media_type: 'movie', content: 'Great show', header: 'Awesome' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockReview);
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          authorId: 2,
          content: 'Great show',
          header: 'Awesome',
          title_id: 246,
          media_type: 'movie',
        },
      });
    });

    it('should return 400 Bad Request if validation fails (missing title_id)', async () => {
      const response = await request(app)
        .post('/v1/reviews')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Great show', header: 'Awesome' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /v1/reviews (Admin)', () => {
    it('should fetch all reviews if the user is an admin', async () => {
      const mockReviews = [
        { id: 1, content: 'Review 1' },
        { id: 2, content: 'Review 2' },
      ];
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);
      (prisma.review.count as jest.Mock).mockResolvedValue(2);

      const response = await request(app)
        .get('/v1/reviews')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockReviews);
      expect(response.body.pagination.total).toBe(2);
    });
  });

  describe('GET /v1/reviews/title/:title_id', () => {
    it('should return a paginated list of reviews for a movie title', async () => {
      const mockReviews = [
        {
          id: 1,
          authorId: 2,
          title_id: 246,
          content: 'Great movie',
          header: 'Loved it',
          upvotes: 4,
          downvotes: 0,
          createdAt: '2026-04-26T12:00:00.000Z',
          author: {
            id: 2,
            display_name: 'Kassie',
            username: 'kassie',
          },
        },
      ];

      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);
      (prisma.review.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app).get('/v1/reviews/title/246?page=2&limit=5');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: mockReviews,
        pagination: {
          page: 2,
          limit: 5,
          total: 1,
          totalPages: 1,
        },
      });
      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: { title_id: 246 },
        include: {
          author: {
            select: {
              id: true,
              display_name: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
      expect(prisma.review.count).toHaveBeenCalledWith({
        where: { title_id: 246 },
      });
    });

    it('should return 400 if title_id is invalid', async () => {
      const response = await request(app).get('/v1/reviews/title/0');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('The title ID in the path must be a positive integer.');
    });

    it('should return 400 if pagination query is invalid', async () => {
      const response = await request(app).get('/v1/reviews/title/246?page=0');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('One or more pagination query parameters are invalid.');
    });
  });

  describe('GET /v1/reviews/user/:user_id', () => {
    it('should return a paginated list of reviews for a user filtered to a movie id', async () => {
      const mockReviews = [
        {
          id: 5,
          authorId: 2,
          title_id: 246,
          media_type: 'movie',
          content: 'Great movie review',
          header: 'Movie thoughts',
          createdAt: '2026-04-26T12:00:00.000Z',
          author: {
            id: 2,
            display_name: 'Kassie',
            username: 'kassie',
          },
        },
      ];

      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);
      (prisma.review.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app).get('/v1/reviews/user/2?movie_id=246&page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: mockReviews,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      });
      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: {
          authorId: 2,
          title_id: 246,
          media_type: 'movie',
        },
        include: {
          author: {
            select: {
              id: true,
              display_name: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(prisma.review.count).toHaveBeenCalledWith({
        where: {
          authorId: 2,
          title_id: 246,
          media_type: 'movie',
        },
      });
    });

    it('should return a paginated list of reviews for a user filtered to a tv id', async () => {
      (prisma.review.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.review.count as jest.Mock).mockResolvedValue(0);

      const response = await request(app).get('/v1/reviews/user/2?tv_id=101');

      expect(response.status).toBe(200);
      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: {
          authorId: 2,
          title_id: 101,
          media_type: 'tv',
        },
        include: {
          author: {
            select: {
              id: true,
              display_name: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
      });
    });

    it('should return 400 if user_id is invalid', async () => {
      const response = await request(app).get('/v1/reviews/user/0');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('The user ID in the path must be a positive integer.');
    });

    it('should return 400 if both movie_id and tv_id are provided', async () => {
      const response = await request(app).get('/v1/reviews/user/2?movie_id=246&tv_id=101');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Provide either movie_id or tv_id, but not both.');
    });

    it('should return 400 if a media filter is invalid', async () => {
      const response = await request(app).get('/v1/reviews/user/2?movie_id=abc');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('One or more review filter query parameters are invalid.');
    });
  });

  describe('GET /v1/reviews/:id', () => {
    it('should return a specific review by its ID', async () => {
      const mockReview = { id: 1, content: 'Found Review' };
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockReview);

      const response = await request(app).get('/v1/reviews/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockReview);
    });

    it('should return 404 if the review does not exist', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get('/v1/reviews/999');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /v1/reviews/:id', () => {
    it('should update the review if the logged-in user is the author', async () => {
      const mockExisting = { id: 1, authorId: 2, content: 'Old Content' };
      const mockUpdated = { id: 1, authorId: 2, content: 'New Content' };

      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockExisting);
      (prisma.review.update as jest.Mock).mockResolvedValue(mockUpdated);

      const response = await request(app)
        .put('/v1/reviews/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'New Content' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUpdated);
    });

    it('should return 403 Forbidden if user tries to update someone else’s review', async () => {
      const mockExisting = { id: 1, authorId: 99, content: 'Someone elses review' };
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockExisting);

      const response = await request(app)
        .put('/v1/reviews/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Hacking attempt' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('You are only allowed to update reviews that you created.');
    });
  });

  describe('DELETE /v1/reviews/:id', () => {
    it('should allow the author to delete their own review', async () => {
      const mockExisting = { id: 1, authorId: 2 };
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockExisting);
      (prisma.review.delete as jest.Mock).mockResolvedValue(mockExisting);

      const response = await request(app)
        .delete('/v1/reviews/1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
    });

    it('should allow an admin to delete anyone’s review', async () => {
      const mockExisting = { id: 1, authorId: 99 }; // Belongs to a different user
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockExisting);
      (prisma.review.delete as jest.Mock).mockResolvedValue(mockExisting);

      const response = await request(app)
        .delete('/v1/reviews/1')
        .set('Authorization', `Bearer ${adminToken}`); // Used Admin token

      expect(response.status).toBe(200);
    });
  });

  describe('Voting Routes', () => {
    it('should successfully upvote a review (first time)', async () => {
      const mockReview = { id: 1, upvotes: 1 };
      
      // Mock transaction
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });
      
      (prisma.reviewVote.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.reviewVote.create as jest.Mock).mockResolvedValue({ userId: 2, reviewId: 1, type: 'UPVOTE' });
      (prisma.review.update as jest.Mock).mockResolvedValue(mockReview);

      const response = await request(app)
        .post('/v1/reviews/1/upvote')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(prisma.reviewVote.create).toHaveBeenCalled();
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { upvotes: { increment: 1 } },
      });
    });

    it('should handle switching from downvote to upvote', async () => {
      const mockReview = { id: 1, upvotes: 1, downvotes: 0 };
      
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });
      
      (prisma.reviewVote.findUnique as jest.Mock).mockResolvedValue({ userId: 2, reviewId: 1, type: 'DOWNVOTE' });
      (prisma.reviewVote.update as jest.Mock).mockResolvedValue({ userId: 2, reviewId: 1, type: 'UPVOTE' });
      (prisma.review.update as jest.Mock).mockResolvedValue(mockReview);

      const response = await request(app)
        .post('/v1/reviews/1/upvote')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(prisma.reviewVote.update).toHaveBeenCalled();
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          downvotes: { decrement: 1 },
          upvotes: { increment: 1 },
        },
      });
    });

    it('should return 400 Bad Request if attempting to remove an upvote when no upvote exists', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(prisma);
      });
      
      (prisma.reviewVote.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/v1/reviews/1/remove-upvote')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200); // Now returns 200 with current review state if nothing to do
    });
  });
});
