import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { clearAuthCookies, setAccessCookie, setAuthCookies } from './cookies.js';
import { User } from './model.js';
import type { LoginInput } from './schema.js';
import {
  REFRESH_COOKIE,
  hashToken,
  readRefreshToken,
  signAccessToken,
  signRefreshToken,
} from './tokens.js';

export const BCRYPT_COST = 12;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin';
};

function toPublicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: 'admin';
}): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

let dummyPasswordHash: string | undefined;

async function rejectUnknownUser(password: string): Promise<void> {
  dummyPasswordHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_COST);
  await bcrypt.compare(password, dummyPasswordHash);
}

export async function login(input: LoginInput, res: Response): Promise<PublicUser> {
  const user = await User.findOne({ email: input.email });
  if (!user) {
    await rejectUnknownUser(input.password);
    throw ApiError.unauthorized('Invalid email or password');
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const accessToken = signAccessToken({ id: String(user._id), role: user.role });
  const refreshToken = signRefreshToken({
    id: String(user._id),
    tokenVersion: user.tokenVersion,
  });
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();
  setAuthCookies(res, accessToken, refreshToken);
  return toPublicUser(user);
}

export async function refresh(req: Request, res: Response): Promise<PublicUser> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string' || token.length === 0) {
    throw ApiError.unauthorized();
  }

  const claims = readRefreshToken(token);
  const user = await User.findById(claims.sub);
  if (
    !user ||
    user.tokenVersion !== claims.tokenVersion ||
    user.refreshTokenHash !== hashToken(token)
  ) {
    throw ApiError.unauthorized();
  }

  setAccessCookie(res, signAccessToken({ id: String(user._id), role: user.role }));
  return toPublicUser(user);
}

export async function logout(req: Request, res: Response): Promise<{ loggedOut: true }> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token === 'string' && token.length > 0) {
    try {
      const claims = readRefreshToken(token);
      await User.updateOne(
        { _id: claims.sub, tokenVersion: claims.tokenVersion },
        { $inc: { tokenVersion: 1 }, $unset: { refreshTokenHash: 1 } },
      );
    } catch {
      // A bad or expired refresh cookie is still cleared below.
    }
  }

  clearAuthCookies(res);
  return { loggedOut: true };
}

export async function me(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId).select('name email role');
  if (!user) {
    throw ApiError.unauthorized();
  }
  return toPublicUser(user);
}
