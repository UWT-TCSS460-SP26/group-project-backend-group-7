import { Request, Response, NextFunction } from 'express';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';
import { prisma } from '../lib/prisma';
import { getAuthErrorMessage } from './authErrors';

export interface AuthenticatedUser {
  sub: string;
  id: number;
  role: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const jwtCheck = expressjwt({
  secret: expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${process.env.AUTH_ISSUER}/.well-known/jwks.json`,
  }) as GetVerificationKey,
  audience: process.env.API_AUDIENCE,
  issuer: process.env.AUTH_ISSUER,
  algorithms: ['RS256'],
});

export const requireAuth = (request: Request, response: Response, next: NextFunction): void => {
  // Let CORS preflight requests pass through without forcing bearer auth.
  if (request.method === 'OPTIONS') {
    next();
    return;
  }

  void jwtCheck(request, response, async (err) => {
    if (err) {
      response.status(401).json({
        error: getAuthErrorMessage(request.headers.authorization, err),
      });
      return;
    }
    const authHeader = request.headers.authorization as string;
    const auth = (request as unknown as { auth: { sub: string } }).auth;

    if (!auth?.sub) {
      response.status(401).json({
        error: 'The bearer token is missing or could not be parsed.',
      });
      return;
    }

    let dbUser = await prisma.user.findUnique({ where: { subjectId: auth.sub } });

    if (!dbUser) {
      try {
        const userinfoRes = await fetch(`${process.env.AUTH_ISSUER}/v2/oauth/userinfo`, {
          headers: { Authorization: authHeader },
        });
        if (!userinfoRes.ok) {
          response.status(401).json({
            error: 'The authenticated user could not be resolved from the identity provider.',
          });
          return;
        }
        const userinfo = (await userinfoRes.json()) as {
          nickname?: string;
          name?: string;
          email?: string;
        };
        const username = userinfo.nickname ?? userinfo.email?.split('@')[0] ?? `user_${auth.sub}`;
        const email = userinfo.email ?? `${auth.sub}@auth2.local`;

        dbUser = await prisma.user.upsert({
          where: { subjectId: auth.sub },
          update: {},
          create: {
            subjectId: auth.sub,
            username,
            email,
            display_name: userinfo.name ?? null,
            role: 2,
          },
        });
      } catch {
        response.status(500).json({
          error: 'The server could not create or load the authenticated user profile.',
        });
        return;
      }
    }

    request.user = { sub: auth.sub, id: dbUser.id, role: dbUser.role };
    next();
  });
};

/**
 * Role gate. Use after requireAuth:
 *
 *   router.delete('/reviews/:id', requireAuth, requireRole(1), handler);
 */
export const requireRole = (role: number) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user) {
      response.status(401).json({
        error: 'Authentication is required before accessing this resource.',
      });
      return;
    }
    if (request.user.role !== role) {
      response.status(403).json({
        error: 'The authenticated user does not have permission to access this resource.',
      });
      return;
    }
    next();
  };
};
