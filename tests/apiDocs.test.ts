import request from 'supertest';
import { app } from '../src/app';

describe('API docs', () => {
  it('GET /api-docs - includes the movie genre search endpoint', async () => {
    const response = await request(app).get('/api-docs');

    expect(response.status).toBe(200);
    expect(response.body.spec.paths['/v1/movie/search/genre']).toBeDefined();
    expect(response.body.spec.paths['/v1/movie/search/genre'].get).toMatchObject({
      summary: 'Search movies by genre',
      tags: ['Movies'],
    });
  });

  it('GET /api-docs - documents the movie genre search query parameters and responses', async () => {
    const response = await request(app).get('/api-docs');
    const genreSearchPath = response.body.spec.paths['/v1/movie/search/genre'].get;

    expect(response.status).toBe(200);
    expect(genreSearchPath.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'q',
          in: 'query',
          required: true,
        }),
        expect.objectContaining({
          name: 'page',
          in: 'query',
          required: false,
        }),
      ])
    );
    expect(genreSearchPath.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/MovieSearchResponse',
    });
    expect(genreSearchPath.responses['404'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/NumericErrorResponse',
    });
    expect(genreSearchPath.responses['502'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/NumericErrorResponse',
    });
  });
});
