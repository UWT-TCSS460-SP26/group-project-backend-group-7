import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import fs from 'fs';
import YAML from 'yaml';
import { routes } from './routes';
import { logger } from './middleware/logger';

const app = express();

// Application-level middleware
const configuredAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const defaultAllowedOrigins = ['http://localhost:3000', 'http://localhost:3001'].filter(
  Boolean
) as string[];

const allowedOrigins = new Set([...configuredAllowedOrigins, ...defaultAllowedOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients and same-origin navigations may omit the Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  })
);
app.use(express.json());
app.use(logger);

// OpenAPI documentation
const specFile = fs.readFileSync('./openapi.yaml', 'utf8');
const spec = YAML.parse(specFile);
const apiDocsMiddlewarePromise: Promise<RequestHandler> =
  import('@scalar/express-api-reference').then(
    ({ apiReference }) =>
      apiReference({
        content: spec,
      }) as RequestHandler
  );

app.use('/api-docs', async (request: Request, response: Response, next: NextFunction) => {
  try {
    const apiDocsMiddleware = await apiDocsMiddlewarePromise;
    apiDocsMiddleware(request, response, next);
  } catch (error) {
    next(error);
  }
});

// Routes
app.use(routes);

// 404 handler — must be after all routes
app.use((_request: Request, response: Response) => {
  response.status(404).json({ error: 'No route matches the requested URL and HTTP method.' });
});

// Malformed JSON handler
app.use((err: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  ) {
    response.status(400).json({
      error: 'The request body contains malformed JSON. Fix the JSON syntax and try again.',
    });
    return;
  }
  response.status(500).json({
    error: 'The server encountered an unexpected error while processing the request.',
  });
});

export { app };
