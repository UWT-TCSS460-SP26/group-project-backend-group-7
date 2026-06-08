import { Request, Response } from 'express';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const GENRE: Record<string, number> = {
  action: 10759,
  action_adventure: 10759,
  adventure: 10759,
  comedy: 35,
  animation: 16,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 10765,
  kids: 10762,
  mystery: 9648,
  news: 10763,
  reality: 10764,
  science_fiction: 10765,
  sci_fi_fantasy: 10765,
  sci_fi: 10765,
  science_fiction_fantasy: 10765,
  soap: 10766,
  talk: 10767,
  war: 10768,
  war_politics: 10768,
  western: 37,
};

type TMDBTVShow = {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  genre_ids: number[];
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  original_language: string;
};

type TMDBTVSearchResponse = {
  page: number;
  results: TMDBTVShow[];
  total_pages: number;
  total_results: number;
};

type TMDBPersonTVCreditsResponse = {
  cast: TMDBTVShow[];
};

const buildImageUrl = (path: string | null) => {
  return path ? `${TMDB_IMAGE_BASE_URL}${path}` : null;
};

const formatTVSearchResponse = (data: TMDBTVSearchResponse) => {
  return {
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    results: data.results.map((show) => ({
      id: show.id,
      name: show.name,
      originalName: show.original_name,
      overview: show.overview,
      firstAirDate: show.first_air_date,
      genreIds: show.genre_ids,
      popularity: show.popularity,
      voteAverage: show.vote_average,
      voteCount: show.vote_count,
      originalLanguage: show.original_language,
      posterPath: show.poster_path,
      posterUrl: buildImageUrl(show.poster_path),
      backdropPath: show.backdrop_path,
      backdropUrl: buildImageUrl(show.backdrop_path),
    })),
  };
};

const formatTVShows = (shows: TMDBTVShow[], page: number) => {
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const pagedShows = shows.slice(start, start + pageSize);

  return formatTVSearchResponse({
    page,
    results: pagedShows,
    total_pages: Math.ceil(shows.length / pageSize),
    total_results: shows.length,
  });
};

/**
 * query with title={insert TV show title}
 *
 * @param request TV show title
 * @param response error code 200, 400
 * @returns Json data of the TV show.
 */
export const getSearchedTVTitle = async (request: Request, response: Response) => {
  const title = request.query.q as string;

  if (typeof title !== 'string' || title === null || title.trim() === '') {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty TV show title.',
    });
  }

  const result = await fetch(
    `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(title)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
        accept: 'application/json',
      },
    }
  );

  if (!result.ok) {
    return response.status(result.status).json({
      error: result.status,
      message: 'TMDB could not complete the TV title search request.',
    });
  }

  const data = (await result.json()) as TMDBTVSearchResponse;

  return response.status(200).json(formatTVSearchResponse(data));
};

/**
 * query with ?genre={enter genre}
 *
 * query with page number ?genre={enter genre}&page=1
 *
 * @param request genre of the TV show and/or (optional) the page number
 * @param response status code 200, 400, 404
 * @returns A list of TV shows with the given genre
 */
export const getSearchedTVGenre = async (request: Request, response: Response) => {
  const genre = (request.query.q ?? request.query.genre) as string;

  const page = Number(request.query.page ?? 1);

  if (typeof genre !== 'string' || genre === null || genre.trim() === '') {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" or "genre" must be a non-empty TV genre name.',
    });
  }

  if (page <= 0 || !Number.isInteger(page)) {
    return response.status(400).json({
      error: 400,
      message: 'The query parameter "page" must be a positive integer.',
    });
  }

  const genreCode = GENRE[genre.toLowerCase().replace(/\s+/g, '_')];

  if (!genreCode) {
    return response.status(404).json({
      error: 404,
      message: 'The provided TV genre could not be matched to a supported genre.',
    });
  }

  try {
    const result = await fetch(
      `https://api.themoviedb.org/3/discover/tv?with_genres=${genreCode}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
          accept: 'application/json',
        },
      }
    );

    if (!result.ok) {
      return response.status(result.status).json({
        error: result.status,
        message: 'TMDB could not complete the TV genre search request.',
      });
    }

    const data = (await result.json()) as TMDBTVSearchResponse;

    return response.status(200).json(formatTVSearchResponse(data));
  } catch (_error) {
    return response.status(502).json({
      error: 502,
      message: 'The API could not reach TMDB while searching for TV shows by genre.',
    });
  }
};


/**
 * query with ?q={enter the actors name}
 *
 * query with ?q={enter the actors name}&genre={enter genre}
 *
 * query with page number ?cast={enter the actors name}&page=1
 *
 * @param request actors name and/or (optional) page number
 * @param response status code 200, 400
 * @returns a list of TV shows that the cast member is in
 */
export const getSearchedTVCast = async (request: Request, response: Response) => {
  const cast = request.query.q as string;

  const genre = (request.query.genre ?? '') as string;

  const page = Number(request.query.page ?? 1);

  if (page <= 0 || !Number.isInteger(page)) {
    return response.status(400).json({
      error: 400,
      message: 'The query parameter "page" must be a positive integer.',
    });
  }

  if (typeof genre !== 'string') {
    return response.status(400).json({
      error: 400,
      message: 'The optional query parameter "genre" must be a string.',
    });
  }

  let genreCode: number = -1;
  if (genre !== '') {
    genreCode = GENRE[genre.toLowerCase().replace(/\s+/g, '_')];

    if (!genreCode) {
      return response.status(404).json({
        error: 404,
        message: 'The provided TV genre could not be matched to a supported genre.',
      });
    }
  }

  if (typeof cast !== 'string' || cast.trim() === '' || cast === null) {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty cast member name.',
    });
  }

  const castIdResult = await fetch(
    `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(cast)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
        accept: 'application/json',
      },
    }
  );

  if (!castIdResult.ok) {
    return response.status(castIdResult.status).json({
      error: castIdResult.status,
      message: 'TMDB could not complete the cast member lookup request.',
    });
  }

  const castData = (await castIdResult.json()) as {
    results: { id: number }[];
  };

  if (castData.results.length === 0) {
    return response.status(404).json({
      error: 404,
      message: 'No cast member was found for the provided search term.',
    });
  }

  const castId = castData.results[0].id;

  const castTVResult = await fetch(`https://api.themoviedb.org/3/person/${castId}/tv_credits`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
      accept: 'application/json',
    },
  });

  if (!castTVResult.ok) {
    return response.status(castTVResult.status).json({
      error: castTVResult.status,
      message: 'TMDB could not retrieve TV credits for the requested cast member.',
    });
  }

  const data = (await castTVResult.json()) as TMDBPersonTVCreditsResponse;

  if (genreCode === -1) {
    return response.status(200).json(formatTVShows(data.cast, page));
  } else {
    const filteredShows = data.cast.filter((show) => show.genre_ids.includes(genreCode));

    return response.status(200).json(formatTVShows(filteredShows, page));
  }
};
