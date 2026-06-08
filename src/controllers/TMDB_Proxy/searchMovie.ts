import { Request, Response } from 'express';

const BASE_URL_MOVIE = 'https://api.themoviedb.org/3/search/movie';
const BASE_URL_DISCOVER_MOVIE = 'https://api.themoviedb.org/3/discover/movie';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const GENRE: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  science_fiction: 878,
  sci_fi: 878,
  thriller: 53,
  tv_movie: 10770,
  war: 10752,
  western: 37,
};

type TMDBMovie = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  genre_ids: number[];
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  vote_average: number;
  vote_count: number;
  original_language: string;
};

type TMDBMovieSearchResponse = {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
};

const buildImageUrl = (path: string | null) => {
  return path ? `${TMDB_IMAGE_BASE_URL}${path}` : null;
};

const formatMovieSearchResponse = (data: TMDBMovieSearchResponse) => {
  return {
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    results: data.results.map((movie) => ({
      id: movie.id,
      title: movie.title,
      originalTitle: movie.original_title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      genreIds: movie.genre_ids,
      popularity: movie.popularity,
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
      originalLanguage: movie.original_language,
      posterPath: movie.poster_path,
      posterUrl: buildImageUrl(movie.poster_path),
      backdropPath: movie.backdrop_path,
      backdropUrl: buildImageUrl(movie.backdrop_path),
    })),
  };
};

const formatMovies = (movies: TMDBMovie[], page: number) => {
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const pagedMovies = movies.slice(start, start + pageSize);

  return formatMovieSearchResponse({
    page,
    results: pagedMovies,
    total_pages: Math.ceil(movies.length / pageSize),
    total_results: movies.length,
  });
};

export const getSearchedMovieTitle = async (request: Request, response: Response) => {
  const title = request.query.q as string;

  if (typeof title !== 'string' || title === null || title.trim() === '') {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty movie title.',
    });
  }

  try {
    const result = await fetch(`${BASE_URL_MOVIE}?query=${encodeURIComponent(title)}`, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
        accept: 'application/json',
      },
    });

    if (!result.ok) {
      return response.status(result.status).json({
        error: result.status,
        message: 'TMDB could not complete the movie title search request.',
      });
    }

    const data = (await result.json()) as TMDBMovieSearchResponse;

    return response.status(200).json(formatMovieSearchResponse(data));
  } catch (_error) {
    return response.status(502).json({
      error: 502,
      message: 'The API could not reach TMDB while searching for movies by title.',
    });
  }
};

export const getSearchedMovieGenre = async (request: Request, response: Response) => {
  const genre = (request.query.q ?? request.query.genre) as string;
  const page = Number(request.query.page ?? 1);

  if (typeof genre !== 'string' || genre === null || genre.trim() === '') {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" or "genre" must be a non-empty movie genre name.',
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
      message: 'The provided movie genre could not be matched to a supported genre.',
    });
  }

  try {
    const result = await fetch(`${BASE_URL_DISCOVER_MOVIE}?with_genres=${genreCode}&page=${page}`, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
        accept: 'application/json',
      },
    });

    if (!result.ok) {
      return response.status(result.status).json({
        error: result.status,
        message: 'TMDB could not complete the movie genre search request.',
      });
    }

    const data = (await result.json()) as TMDBMovieSearchResponse;

    return response.status(200).json(formatMovieSearchResponse(data));
  } catch (_error) {
    return response.status(502).json({
      error: 502,
      message: 'The API could not reach TMDB while searching for movies by genre.',
    });
  }
};

export const getSearchedMovieCast = async (request: Request, response: Response) => {
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
        message: 'The provided movie genre could not be matched to a supported genre.',
      });
    }
  }

  if (typeof cast !== 'string' || cast.trim() === '' || cast === null) {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty cast member name.',
    });
  }

  try {
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

    const castMovieResult = await fetch(`https://api.themoviedb.org/3/person/${castId}/movie_credits`, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
        accept: 'application/json',
      },
    });

    if (!castMovieResult.ok) {
      return response.status(castMovieResult.status).json({
        error: castMovieResult.status,
        message: 'TMDB could not retrieve movie credits for the requested cast member.',
      });
    }

    const data = (await castMovieResult.json()) as { cast: TMDBMovie[] };

    if (genreCode === -1) {
      return response.status(200).json(formatMovies(data.cast, page));
    } else {
      const filteredMovies = data.cast.filter((movie) => movie.genre_ids.includes(genreCode));

      return response.status(200).json(formatMovies(filteredMovies, page));
    }
  } catch (_error) {
    return response.status(502).json({
      error: 502,
      message: 'The API could not reach TMDB while searching for movies by cast.',
    });
  }
};

