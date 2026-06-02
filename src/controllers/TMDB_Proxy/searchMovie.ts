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
  const genre = request.query.q as string;
  const page = Number(request.query.page ?? 1);

  if (typeof genre !== 'string' || genre === null || genre.trim() === '') {
    return response.status(400).json({
      error: 400,
      message: 'The required query parameter "q" must be a non-empty movie genre name.',
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
