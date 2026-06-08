import request from 'supertest';
import { app } from '../src/app';

type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const mockFetchResponse = (body: unknown, status = 200): MockFetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const tvShow = (overrides = {}) => ({
  id: 1,
  name: 'Breaking Bad',
  original_name: 'Breaking Bad',
  overview: 'A chemistry teacher starts a new life.',
  first_air_date: '2008-01-20',
  genre_ids: [18, 80],
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  popularity: 100,
  vote_average: 8.9,
  vote_count: 1000,
  original_language: 'en',
  ...overrides,
});

describe('TV Search Proxy Routes', () => {
  const originalToken = process.env.TMDB_API_TOKEN;

  beforeEach(() => {
    process.env.TMDB_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.TMDB_API_TOKEN = originalToken;
  });

  it('GET /v1/tv/search/title - returns formatted TV metadata with poster images', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [tvShow()],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/tv/search/title').query({ q: 'breaking bad' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/search/tv?query=breaking%20bad',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
          accept: 'application/json',
        },
      })
    );
    expect(response.body).toEqual({
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 1,
          name: 'Breaking Bad',
          originalName: 'Breaking Bad',
          overview: 'A chemistry teacher starts a new life.',
          firstAirDate: '2008-01-20',
          genreIds: [18, 80],
          popularity: 100,
          voteAverage: 8.9,
          voteCount: 1000,
          originalLanguage: 'en',
          posterPath: '/poster.jpg',
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          backdropPath: '/backdrop.jpg',
          backdropUrl: 'https://image.tmdb.org/t/p/w500/backdrop.jpg',
        },
      ],
    });
  });

  it('GET /v1/tv/search/title - returns 400 when q is missing', async () => {
    const response = await request(app).get('/v1/tv/search/title');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty TV show title.',
    });
  });

  it('GET /v1/tv/search/title - returns 400 when q is blank', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/tv/search/title').query({ q: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty TV show title.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/tv/search/title - returns TMDB error statuses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ status_message: 'Invalid API key' }, 401) as Awaited<
          ReturnType<typeof fetch>
        >
      );

    const response = await request(app).get('/v1/tv/search/title').query({ q: 'lost' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 401,
      message: 'TMDB could not complete the TV title search request.',
    });
  });

  it('GET /v1/tv/search/genre - searches TV shows by genre', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 2,
        total_pages: 3,
        total_results: 45,
        results: [
          tvShow({
            id: 2,
            name: 'Drama Show',
            genre_ids: [18],
            poster_path: null,
            backdrop_path: null,
          }),
        ],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/tv/search/genre').query({ q: 'drama', page: '2' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/discover/tv?with_genres=18&page=2',
      expect.any(Object)
    );
    expect(response.body.totalPages).toBe(3);
    expect(response.body.totalResults).toBe(45);
    expect(response.body.results[0]).toMatchObject({
      id: 2,
      name: 'Drama Show',
      genreIds: [18],
      posterPath: null,
      posterUrl: null,
      backdropPath: null,
      backdropUrl: null,
    });
  });

  it('GET /v1/tv/search/genre - supports "genre" alias parameter', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [tvShow()],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/tv/search/genre').query({ genre: 'drama' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/discover/tv?with_genres=18&page=1',
      expect.any(Object)
    );
  });

  it('GET /v1/tv/search/genre - returns 404 for an unknown genre', async () => {
    const response = await request(app).get('/v1/tv/search/genre').query({ q: 'not-a-genre' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 404,
      message: 'The provided TV genre could not be matched to a supported genre.',
    });
  });

  it('GET /v1/tv/search/genre - returns 400 for invalid page numbers', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/tv/search/genre').query({ q: 'drama', page: '0' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The query parameter "page" must be a positive integer.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/tv/search/cast - returns cast TV credits filtered by genre', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        mockFetchResponse({
          results: [{ id: 31 }],
        }) as Awaited<ReturnType<typeof fetch>>
      )
      .mockResolvedValueOnce(
        mockFetchResponse({
          cast: [
            tvShow({
              id: 10,
              name: 'Family Ties',
              genre_ids: [35, 18, 10751],
            }),
            tvShow({
              id: 20,
              name: 'Action TV Credit',
              genre_ids: [10759, 18],
            }),
          ],
        }) as Awaited<ReturnType<typeof fetch>>
      );

    const response = await request(app)
      .get('/v1/tv/search/cast')
      .query({ q: 'tom hanks', genre: 'action' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.themoviedb.org/3/search/person?query=tom%20hanks',
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.themoviedb.org/3/person/31/tv_credits',
      expect.any(Object)
    );
    expect(response.body.totalResults).toBe(1);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({
      id: 20,
      name: 'Action TV Credit',
      genreIds: [10759, 18],
    });
  });

  it('GET /v1/tv/search/cast - returns 404 when the cast member is not found', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        results: [],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/tv/search/cast').query({ q: 'unknown person' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 404,
      message: 'No cast member was found for the provided search term.',
    });
  });

  it('GET /v1/tv/search/cast - returns 400 when q is missing', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/tv/search/cast');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty cast member name.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/tv/search/cast - returns 404 for an unknown genre filter', async () => {
    global.fetch = jest.fn();

    const response = await request(app)
      .get('/v1/tv/search/cast')
      .query({ q: 'tom hanks', genre: 'not-a-genre' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 404,
      message: 'The provided TV genre could not be matched to a supported genre.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/tv/search/cast - paginates unfiltered cast TV credits', async () => {
    const cast = Array.from({ length: 21 }, (_, index) =>
      tvShow({
        id: index + 1,
        name: `TV Credit ${index + 1}`,
      })
    );

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        mockFetchResponse({
          results: [{ id: 31 }],
        }) as Awaited<ReturnType<typeof fetch>>
      )
      .mockResolvedValueOnce(
        mockFetchResponse({
          cast,
        }) as Awaited<ReturnType<typeof fetch>>
      );

    const response = await request(app)
      .get('/v1/tv/search/cast')
      .query({ q: 'tom hanks', page: '2' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 2,
      totalPages: 2,
      totalResults: 21,
    });
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({
      id: 21,
      name: 'TV Credit 21',
    });
  });
});
