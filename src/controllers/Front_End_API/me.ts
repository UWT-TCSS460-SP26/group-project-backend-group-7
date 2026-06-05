import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const PAGE_SIZE = 10;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

type TmdbMovieDetails = {
  id: number;
  title: string;
  genres: { id: number; name: string }[];
  release_date: string;
  overview: string;
  poster_path: string | null;
};

type TmdbTvDetails = {
  id: number;
  name: string;
  genres: { id: number; name: string }[];
  first_air_date: string;
  number_of_episodes: number;
  number_of_seasons: number;
  overview: string;
  poster_path: string | null;
};

const buildImageUrl = (path: string | null) => (path ? `${TMDB_IMAGE_BASE}${path}` : null);

const fetchTmdbMetadata = async (
  mediaType: string,
  titleId: number
): Promise<TmdbMovieDetails | TmdbTvDetails | null> => {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return null;

  const url =
    mediaType === 'movie'
      ? `https://api.themoviedb.org/3/movie/${titleId}`
      : `https://api.themoviedb.org/3/tv/${titleId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as TmdbMovieDetails | TmdbTvDetails;
  } catch {
    return null;
  }
};

const formatMetadata = (mediaType: string, data: TmdbMovieDetails | TmdbTvDetails) => {
  if (mediaType === 'movie') {
    const movie = data as TmdbMovieDetails;
    return {
      id: movie.id,
      title: movie.title,
      genre: movie.genres.map((g) => g.name).join(', '),
      year: movie.release_date ? movie.release_date.slice(0, 4) : 'Unknown',
      summary: movie.overview,
      poster_url: buildImageUrl(movie.poster_path),
    };
  }

  const tv = data as TmdbTvDetails;
  return {
    id: tv.id,
    title: tv.name,
    genre: tv.genres.map((g) => g.name).join(', '),
    year: tv.first_air_date ? tv.first_air_date.slice(0, 4) : 'Unknown',
    summary: tv.overview,
    poster_url: buildImageUrl(tv.poster_path),
    episodes: tv.number_of_episodes,
    seasons: tv.number_of_seasons,
  };
};

export const getMyRatings = async (req: Request, res: Response): Promise<void> => {
  const authorId = req.user!.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  try {
    const [total, ratings] = await Promise.all([
      prisma.rating.count({ where: { authorId } }),
      prisma.rating.findMany({
        where: { authorId },
        orderBy: { id: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
    ]);

    const enriched = await Promise.all(
      ratings.map(async (r) => {
        const raw = r.media_type ? await fetchTmdbMetadata(r.media_type, r.title_id) : null;
        return {
          id: r.id,
          title_id: r.title_id,
          media_type: r.media_type,
          rating: r.rating,
          metadata: raw ? formatMetadata(r.media_type!, raw) : null,
        };
      })
    );

    res.status(200).json({
      data: enriched,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (_error) {
    res.status(500).json({ error: 'The server could not retrieve your ratings.' });
  }
};

export const getMyReviews = async (req: Request, res: Response): Promise<void> => {
  const authorId = req.user!.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  try {
    const [total, reviews] = await Promise.all([
      prisma.review.count({ where: { authorId } }),
      prisma.review.findMany({
        where: { authorId },
        orderBy: { id: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
    ]);

    const enriched = await Promise.all(
      reviews.map(async (r) => {
        const raw = r.media_type ? await fetchTmdbMetadata(r.media_type, r.title_id) : null;
        return {
          id: r.id,
          title_id: r.title_id,
          media_type: r.media_type,
          content: r.content,
          header: r.header,
          upvotes: r.upvotes,
          downvotes: r.downvotes,
          createdAt: r.createdAt,
          metadata: raw ? formatMetadata(r.media_type!, raw) : null,
        };
      })
    );

    res.status(200).json({
      data: enriched,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (_error) {
    res.status(500).json({ error: 'The server could not retrieve your reviews.' });
  }
};

export const getMyVotes = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  try {
    const votes = await prisma.reviewVote.findMany({
      where: { userId },
      select: {
        reviewId: true,
        type: true,
      },
    });

    res.status(200).json({
      data: votes.map((v) => ({
        reviewId: v.reviewId,
        vote: v.type === 'UPVOTE' ? 'up' : 'down',
      })),
    });
  } catch (_error) {
    res.status(500).json({ error: 'The server could not retrieve your votes.' });
  }
};
