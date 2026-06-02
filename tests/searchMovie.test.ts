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

const movie = (overrides = {}) => ({
  id: 1,
  title: 'Inception',
  original_title: 'Inception',
  overview: 'A thief who steals corporate secrets through dream-sharing technology.',
  release_date: '2010-07-16',
  genre_ids: [28, 878],
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  popularity: 120,
  vote_average: 8.4,
  vote_count: 36000,
  original_language: 'en',
  ...overrides,
});

describe('Movie Search Proxy Routes', () => {
  const originalToken = process.env.TMDB_API_TOKEN;

  beforeEach(() => {
    process.env.TMDB_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.TMDB_API_TOKEN = originalToken;
  });

  it('GET /v1/movie/search/title - returns formatted movie metadata with poster images', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie()],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'inception' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/search/movie?query=inception',
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
          title: 'Inception',
          originalTitle: 'Inception',
          overview: 'A thief who steals corporate secrets through dream-sharing technology.',
          releaseDate: '2010-07-16',
          genreIds: [28, 878],
          popularity: 120,
          voteAverage: 8.4,
          voteCount: 36000,
          originalLanguage: 'en',
          posterPath: '/poster.jpg',
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          backdropPath: '/backdrop.jpg',
          backdropUrl: 'https://image.tmdb.org/t/p/w500/backdrop.jpg',
        },
      ],
    });
  });

  it('GET /v1/movie/search/title - encodes movie title queries', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'spider man' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/search/movie?query=spider%20man',
      expect.any(Object)
    );
  });

  it('GET /v1/movie/search/title - returns multiple formatted movie results', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [
          movie({ id: 1, title: 'Inception' }),
          movie({
            id: 2,
            title: 'Interstellar',
            original_title: 'Interstellar',
            release_date: '2014-11-07',
            poster_path: '/interstellar.jpg',
            backdrop_path: '/interstellar-backdrop.jpg',
          }),
        ],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'space' });

    expect(response.status).toBe(200);
    expect(response.body.totalResults).toBe(2);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[1]).toMatchObject({
      id: 2,
      title: 'Interstellar',
      releaseDate: '2014-11-07',
      posterUrl: 'https://image.tmdb.org/t/p/w500/interstellar.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w500/interstellar-backdrop.jpg',
    });
  });

  it('GET /v1/movie/search/title - returns 500 when TMDB_API_TOKEN is missing', async () => {
    delete process.env.TMDB_API_TOKEN;
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'inception' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'The server is missing required configuration for TMDB_API_TOKEN.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/movie/search/title - returns 400 when q is missing', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/movie/search/title');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty movie title.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/movie/search/title - returns 400 when q is blank', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/movie/search/title').query({ q: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty movie title.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/movie/search/title - returns TMDB error statuses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ status_message: 'Invalid API key' }, 401) as Awaited<
          ReturnType<typeof fetch>
        >
      );

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'inception' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 401,
      message: 'TMDB could not complete the movie title search request.',
    });
  });

  it('GET /v1/movie/search/title - returns null image URLs when paths are null', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie({ poster_path: null, backdrop_path: null })],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'inception' });

    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      posterPath: null,
      posterUrl: null,
      backdropPath: null,
      backdropUrl: null,
    });
  });

  it('GET /v1/movie/search - supports the frontend-friendly alias route', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [movie()],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app).get('/v1/movie/search').query({ q: 'inception' });

    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      id: 1,
      title: 'Inception',
    });
  });

  it('GET /v1/movie/search/title - returns 502 when TMDB is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const response = await request(app).get('/v1/movie/search/title').query({ q: 'inception' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 502,
      message: 'The API could not reach TMDB while searching for movies by title.',
    });
  });

  it('GET /v1/movie/search/genre - returns movies for a supported genre', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 2,
        total_pages: 4,
        total_results: 80,
        results: [movie({ title: 'Mad Max: Fury Road' })],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app)
      .get('/v1/movie/search/genre')
      .query({ q: 'action', page: 2 });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/discover/movie?with_genres=28&page=2',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
          accept: 'application/json',
        },
      })
    );
    expect(response.body).toMatchObject({
      page: 2,
      totalPages: 4,
      totalResults: 80,
    });
  });

  it('GET /v1/movie/search/genre - normalizes spaced genre names', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockFetchResponse({
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      }) as Awaited<ReturnType<typeof fetch>>
    );

    const response = await request(app)
      .get('/v1/movie/search/genre')
      .query({ q: 'science fiction' });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/discover/movie?with_genres=878&page=1',
      expect.any(Object)
    );
  });

  it('GET /v1/movie/search/genre - returns 400 when q is missing', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/movie/search/genre');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty movie genre name.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/movie/search/genre - returns 400 when page is invalid', async () => {
    global.fetch = jest.fn();

    const response = await request(app)
      .get('/v1/movie/search/genre')
      .query({ q: 'action', page: 0 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 400,
      message: 'The query parameter "page" must be a positive integer.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/movie/search/genre - returns 404 for an unsupported genre', async () => {
    global.fetch = jest.fn();

    const response = await request(app).get('/v1/movie/search/genre').query({ q: 'made up genre' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 404,
      message: 'The provided movie genre could not be matched to a supported genre.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET /v1/movie/search/genre - returns TMDB error statuses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        mockFetchResponse({ status_message: 'Invalid API key' }, 401) as Awaited<
          ReturnType<typeof fetch>
        >
      );

    const response = await request(app).get('/v1/movie/search/genre').query({ q: 'action' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 401,
      message: 'TMDB could not complete the movie genre search request.',
    });
  });

  it('GET /v1/movie/search/genre - returns 502 when TMDB is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const response = await request(app).get('/v1/movie/search/genre').query({ q: 'action' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 502,
      message: 'The API could not reach TMDB while searching for movies by genre.',
    });
  });
});
