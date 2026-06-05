import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/middleware/requireAuth', () => jest.requireActual('./__mocks__/requireAuth'));
jest.mock('../src/lib/prisma', () => jest.requireActual('./__mocks__/libPrisma'));

const { meRouter } = jest.requireActual(
  '../src/routes/Front_End_API/me'
) as typeof import('../src/routes/Front_End_API/me');
const { prisma } = jest.requireMock('../src/lib/prisma') as typeof import('../src/lib/prisma');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/users/me', meRouter);
  return app;
};

const app = createApp();

const TEST_SECRET = 'test-secret';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TMDB_API_TOKEN = 'test-token';
});

afterEach(() => {
  jest.clearAllMocks();
});

const mintToken = (sub: number, role: number) =>
  jwt.sign({ sub, email: 'test@dev.local', role }, TEST_SECRET);

const userToken = mintToken(1, 2);

const mockTmdbMovie = {
  id: 550,
  title: 'Fight Club',
  genres: [{ id: 18, name: 'Drama' }],
  release_date: '1999-10-15',
  overview: 'An insomniac office worker forms a fight club.',
  poster_path: '/poster.jpg',
};

describe('GET /v1/users/me/ratings', () => {
  it('returns enriched ratings for the authenticated user', async () => {
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([
      { id: 1, authorId: 1, title_id: 550, media_type: 'movie', rating: 4 },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTmdbMovie,
    });

    const res = await request(app)
      .get('/v1/users/me/ratings')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 1,
      title_id: 550,
      media_type: 'movie',
      rating: 4,
      metadata: {
        id: 550,
        title: 'Fight Club',
        genre: 'Drama',
        year: '1999',
        poster_url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      },
    });
    expect(res.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('sets metadata to null when TMDB returns a non-200 for that item', async () => {
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([
      { id: 2, authorId: 1, title_id: 999, media_type: 'movie', rating: 3 },
    ]);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    const res = await request(app)
      .get('/v1/users/me/ratings')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].metadata).toBeNull();
  });

  it('sets metadata to null for ratings without a media_type', async () => {
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([
      { id: 3, authorId: 1, title_id: 550, media_type: null, rating: 5 },
    ]);
    global.fetch = jest.fn();

    const res = await request(app)
      .get('/v1/users/me/ratings')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].metadata).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('paginates correctly', async () => {
    (prisma.rating.count as jest.Mock).mockResolvedValue(25);
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    global.fetch = jest.fn();

    const res = await request(app)
      .get('/v1/users/me/ratings?page=3')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 3, pageSize: 10, total: 25, totalPages: 3 });
    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/v1/users/me/ratings');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/users/me/reviews', () => {
  it('returns enriched reviews for the authenticated user', async () => {
    (prisma.review.count as jest.Mock).mockResolvedValue(1);
    (prisma.review.findMany as jest.Mock).mockResolvedValue([
      {
        id: 1,
        authorId: 1,
        title_id: 550,
        media_type: 'movie',
        content: 'Great film',
        header: 'Loved it',
        upvotes: 2,
        downvotes: 0,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTmdbMovie,
    });

    const res = await request(app)
      .get('/v1/users/me/reviews')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 1,
      title_id: 550,
      media_type: 'movie',
      content: 'Great film',
      header: 'Loved it',
      upvotes: 2,
      downvotes: 0,
      metadata: { id: 550, title: 'Fight Club', genre: 'Drama', year: '1999' },
    });
    expect(res.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('sets metadata to null when TMDB fails for that item', async () => {
    (prisma.review.count as jest.Mock).mockResolvedValue(1);
    (prisma.review.findMany as jest.Mock).mockResolvedValue([
      {
        id: 2,
        authorId: 1,
        title_id: 999,
        media_type: 'tv',
        content: 'Meh',
        header: null,
        upvotes: 0,
        downvotes: 0,
        createdAt: new Date(),
      },
    ]);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    const res = await request(app)
      .get('/v1/users/me/reviews')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].metadata).toBeNull();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/v1/users/me/reviews');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/users/me/votes', () => {
  it('returns a list of votes for the authenticated user', async () => {
    const mockVotes = [
      { reviewId: 10, type: 'UPVOTE' },
      { reviewId: 12, type: 'DOWNVOTE' },
    ];
    (prisma.reviewVote.findMany as jest.Mock).mockResolvedValue(mockVotes);

    const res = await request(app)
      .get('/v1/users/me/votes')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { reviewId: 10, vote: 'up' },
      { reviewId: 12, vote: 'down' },
    ]);
    expect(prisma.reviewVote.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: { reviewId: true, type: true },
    });
  });

  it('returns an empty list if the user has no votes', async () => {
    (prisma.reviewVote.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/users/me/votes')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/v1/users/me/votes');
    expect(res.status).toBe(401);
  });
});
