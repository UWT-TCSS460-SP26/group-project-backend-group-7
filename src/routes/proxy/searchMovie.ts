import { Router } from 'express';
import { requireEnvVar } from '../../middleware/validation';
import {
  getSearchedMovieCast,
  getSearchedMovieGenre,
  getSearchedMovieTitle,
} from '../../controllers/TMDB_Proxy/searchMovie';

const searchMovieRouter = Router();

searchMovieRouter.use(requireEnvVar('TMDB_API_TOKEN'));

searchMovieRouter.get('/movie/search', getSearchedMovieTitle);
searchMovieRouter.get('/movie/search/title', getSearchedMovieTitle);
searchMovieRouter.get('/movie/search/genre', getSearchedMovieGenre);
searchMovieRouter.get('/movie/search/cast', getSearchedMovieCast);

export { searchMovieRouter };

