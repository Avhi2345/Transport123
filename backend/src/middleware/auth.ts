import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, User, UserRole } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: User;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Authorization header must be Bearer followed by token' });
  }

  const token = parts[1];

  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;

  // Intercept Mock Admin login for developer testing
  if (isDevOrTest && token === 'mock-admin-token') {
    let user = await prisma.user.findUnique({
      where: { username: 'admin-uuid-abhi' }
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: 'admin-uuid-abhi',
          email: 'abhi@gmail.com',
          role: UserRole.admin,
          is_verified: true,
        }
      });
    }
    req.user = user;
    return next();
  }

  // Intercept Mock Operator login for developer testing
  if (isDevOrTest && token === 'mock-operator-token') {
    let user = await prisma.user.findUnique({
      where: { username: 'operator-uuid-mock' }
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: 'operator-uuid-mock',
          email: 'operator@gmail.com',
          role: UserRole.transport_operator,
          is_verified: true,
        }
      });
    }
    // Ensure Rajesh's Operator Profile is approved (linking operator user ID)
    await prisma.transportOperatorProfile.upsert({
      where: { user_id: user.id },
      update: { verification_status: 'approved' },
      create: {
        user_id: user.id,
        operator_name: 'Mock Fleet Operations',
        phone: '9876543210',
        verification_status: 'approved',
        is_active: true
      }
    });
    req.user = user;
    return next();
  }

  // Intercept Mock Traveler login for developer testing
  if (isDevOrTest && token === 'mock-traveler-token') {
    let user = await prisma.user.findUnique({
      where: { username: 'traveler-uuid-mock' }
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: 'traveler-uuid-mock',
          email: 'traveler@gmail.com',
          role: UserRole.traveler,
          is_verified: true,
        }
      });
    }
    req.user = user;
    return next();
  }

  try {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    let payload: any = null;

    if (supabaseUrl && supabaseKey) {
      try {
        // Validate token asymmetrically by calling Supabase Auth getUser endpoint
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${token}`
          }
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error_description || errorData.error || `HTTP error ${response.status}`);
        }
        const userData = await response.json();
        payload = {
          sub: userData.id,
          email: userData.email,
          user_metadata: userData.user_metadata
        };
      } catch (err: any) {
        console.error('Asymmetric verification failed via Supabase API, trying symmetric verification:', err.message);
        if (jwtSecret) {
          payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
        } else {
          throw err;
        }
      }
    } else if (jwtSecret) {
      // Validate token using HS256 secret provided by Supabase
      payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    } else {
      // Fallback: decode without verification for local development convenience if no secret provided
      console.warn('WARNING: SUPABASE_JWT_SECRET is not set. Decoding JWT without signature verification.');
      payload = jwt.decode(token);
    }

    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const supabaseUid = payload.sub; // Supabase User UUID
    const email = payload.email || '';

    // Get or create user mapped to Supabase UUID
    let user = await prisma.user.findUnique({
      where: { username: supabaseUid }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          username: supabaseUid,
          email: email,
          role: (payload.user_metadata?.role as UserRole) || 'traveler',
          is_verified: true,
        }
      });
    } else {
      // Sync user metadata (e.g. role) from Supabase metadata if present
      const metaRole = payload.user_metadata?.role as UserRole | undefined;
      if (metaRole && user.role !== metaRole) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: metaRole }
        });
      }
    }

    req.user = user;
    next();
  } catch (error: any) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: `Authentication failed: ${error.message}` });
  }
}

// Helper middleware for operator permissions
export function operatorMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'transport_operator') {
    return res.status(403).json({ error: 'Operator access required' });
  }

  next();
}
