import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma } from '@prisma/client';

jest.mock('../src/middleware/requireAuth', () => jest.requireActual('./__mocks__/requireAuth'));
jest.mock('../src/lib/prisma', () => jest.requireActual('./__mocks__/libPrisma'));
jest.mock('../src/prisma', () => jest.requireMock('../src/lib/prisma'));

const { ratingsRouter } = jest.requireActual(
  '../src/routes/database/ratings'
) as typeof import('../src/routes/database/ratings');
const { prisma } = jest.requireMock('../src/lib/prisma') as typeof import('../src/lib/prisma');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/ratings', ratingsRouter);
  return app;
};

const app = createApp();

const TEST_SECRET = 'test-secret';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 7, role: 2 });
});

const mintToken = (sub: number, role: number) =>
  jwt.sign({ sub, email: 'test@dev.local', role }, TEST_SECRET);

const userToken = mintToken(7, 2);
const expiredUserToken = jwt.sign({ sub: 7, email: 'test@dev.local', role: 2 }, TEST_SECRET, {
  expiresIn: -10,
});

const ratingRecord = (overrides = {}) => ({
  id: 1,
  authorId: 7,
  rating: 4,
  title_id: 99,
  media_type: 'movie',
  author: {
    id: 7,
    display_name: 'Tester',
  },
  ...overrides,
});

describe('POST /v1/ratings/:title_id', () => {
  it('creates a rating', async () => {
    (prisma.rating.create as jest.Mock).mockResolvedValue(ratingRecord());

    const res = await request(app)
      .post('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 4, media_type: 'movie' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: ratingRecord() });
  });

  it('updates an existing rating when a duplicate already exists', async () => {
    (prisma.rating.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );
    (prisma.rating.update as jest.Mock).mockResolvedValue(ratingRecord({ rating: 5 }));

    const res = await request(app)
      .post('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 5, media_type: 'movie' });

    expect(res.status).toBe(200);
    expect(prisma.rating.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { rating: 5 },
      })
    );
    expect(res.body).toEqual({ data: ratingRecord({ rating: 5 }) });
  });

  it('caps new ratings above 5 down to 5', async () => {
    (prisma.rating.create as jest.Mock).mockResolvedValue(ratingRecord({ rating: 5 }));

    const res = await request(app)
      .post('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 9, media_type: 'movie' });

    expect(res.status).toBe(201);
    expect(prisma.rating.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rating: 5 }),
      })
    );
    expect(res.body).toEqual({ data: ratingRecord({ rating: 5 }) });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/v1/ratings/99').send({ rating: 4 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'The bearer token is missing.' });
  });

  it('returns 401 when the bearer token is expired', async () => {
    const res = await request(app)
      .post('/v1/ratings/99')
      .set('Authorization', `Bearer ${expiredUserToken}`)
      .send({ rating: 4 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'The bearer token has expired.' });
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const res = await request(app)
      .post('/v1/ratings/99')
      .set('Authorization', 'Bearer not-a-jwt')
      .send({ rating: 4 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'The bearer token is invalid.' });
  });

  it('returns 400 for invalid rating input', async () => {
    const res = await request(app)
      .post('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 'bad' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'The request body field "rating" must be an integer.' });
  });
});

describe('GET /v1/ratings/title/:title_id', () => {
  it('returns title ratings', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([ratingRecord()]);

    const res = await request(app)
      .get('/v1/ratings/title/99')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [ratingRecord()] });
  });

  it('returns 400 for invalid title_id', async () => {
    const res = await request(app)
      .get('/v1/ratings/title/0')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'The path parameter "title_id" must be a positive integer.',
    });
  });
});

describe('GET /v1/ratings/user/:authorId/title/:title_id', () => {
  it('allows OPTIONS preflight without auth', async () => {
    const res = await request(app).options('/v1/ratings/user/7/title/99');

    expect(res.status).toBe(200);
    expect(res.headers.allow).toContain('GET');
  });

  it('returns one user rating for one title', async () => {
    (prisma.rating.findUnique as jest.Mock).mockResolvedValue(ratingRecord());

    const res = await request(app)
      .get('/v1/ratings/user/7/title/99')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: ratingRecord() });
  });

  it('returns 400 for invalid authorId', async () => {
    const res = await request(app)
      .get('/v1/ratings/user/0/title/99')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'The path parameter "authorId" must be a positive integer.',
    });
  });
});

describe('PATCH /v1/ratings/:title_id', () => {
  it('updates a rating', async () => {
    (prisma.rating.update as jest.Mock).mockResolvedValue(ratingRecord({ rating: 2 }));

    const res = await request(app)
      .patch('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: ratingRecord({ rating: 2 }) });
  });

  it('caps updated ratings above 5 down to 5', async () => {
    (prisma.rating.update as jest.Mock).mockResolvedValue(ratingRecord({ rating: 5 }));

    const res = await request(app)
      .patch('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 8 });

    expect(res.status).toBe(200);
    expect(prisma.rating.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { rating: 5 },
      })
    );
    expect(res.body).toEqual({ data: ratingRecord({ rating: 5 }) });
  });

  it('returns 404 when the rating is missing', async () => {
    (prisma.rating.update as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      })
    );

    const res = await request(app)
      .patch('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 2 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'No existing rating was found for the authenticated user and requested title.',
    });
  });
});

describe('GET /v1/ratings/user/:authorId', () => {
  it('returns paginated ratings', async () => {
    (prisma.rating.count as jest.Mock).mockResolvedValue(12);
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([
      ratingRecord({ id: 12 }),
      ratingRecord({ id: 11, title_id: 98 }),
    ]);

    const res = await request(app)
      .get('/v1/ratings/user/7')
      .query({ page: 2 })
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [ratingRecord({ id: 12 }), ratingRecord({ id: 11, title_id: 98 })],
      pagination: {
        page: 2,
        pageSize: 10,
        totalRatings: 12,
        totalPages: 2,
      },
    });
  });

  it('returns 400 for invalid page', async () => {
    const res = await request(app)
      .get('/v1/ratings/user/7')
      .query({ page: 0 })
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'The query parameter "page" must be a positive integer.',
    });
  });
});

describe('DELETE /v1/ratings/:title_id', () => {
  it('deletes a rating', async () => {
    (prisma.rating.delete as jest.Mock).mockResolvedValue(ratingRecord());

    const res = await request(app)
      .delete('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: ratingRecord() });
  });

  it('returns 404 when the rating does not exist', async () => {
    (prisma.rating.delete as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      })
    );

    const res = await request(app)
      .delete('/v1/ratings/99')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'No existing rating was found for the authenticated user and requested title.',
    });
  });
});
