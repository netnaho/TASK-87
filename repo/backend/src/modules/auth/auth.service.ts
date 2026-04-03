import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../../config';
import prisma from '../../lib/prisma';
import { encrypt, maskPhone } from '../../lib/encryption';
import { logger } from '../../lib/logger';
import { JwtPayload } from '../../types';
import { RegisterInput, LoginInput } from './auth.schema';
import { Role } from '@prisma/client';

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) {
      throw Object.assign(new Error('Username already taken'), { statusCode: 409, code: 'CONFLICT' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(input.password + salt, 12);

    const phoneEncrypted = input.phone ? encrypt(input.phone) : null;
    const phoneMasked = input.phone ? maskPhone(input.phone) : null;

    const user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash,
        salt,
        displayName: input.displayName,
        role: (input.role as Role) || 'GUEST',
        phoneEncrypted,
        phoneMasked,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        phoneMasked: true,
        createdAt: true,
      },
    });

    // Create initial trust score
    await prisma.trustScore.create({
      data: { userId: user.id, score: 50.0 },
    });

    logger.info({ userId: user.id, username: user.username }, 'User registered');

    const token = this.generateToken(user.id, user.username, user.role);
    return { user, token };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { username: input.username },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        passwordHash: true,
        salt: true,
        phoneMasked: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(input.password + user.salt, user.passwordHash);
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }

    logger.info({ userId: user.id, username: user.username }, 'User logged in');

    const token = this.generateToken(user.id, user.username, user.role);
    const { passwordHash, salt, ...safeUser } = user;
    return { user: safeUser, token };
  }

  async getCurrentUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        phoneMasked: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    return user;
  }

  private generateToken(userId: number, username: string, role: Role): string {
    const payload: JwtPayload = { userId, username, role };
    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  }
}

export const authService = new AuthService();
