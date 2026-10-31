import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const sameSiteSchema = z.enum(['lax', 'strict', 'none']);

const envSchema = z.object({
  NODE_ENV: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === '' ? 'development' : value.trim(),
    )
    .pipe(z.enum(['development', 'test', 'production'])),
  PORT: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return '4000';
    }
    return value.trim();
  }, z.coerce.number().int().min(1).max(65535)),
  MONGODB_URI: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    ),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Comma-separated allow-list. A single origin is the usual local setup.
  CLIENT_ORIGIN: z.string().min(1),
  COOKIE_HTTPONLY: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_SAMESITE: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? 'lax' : value.trim()))
    .pipe(sameSiteSchema),
});

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseClientOrigins(value: string): string[] | undefined {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0 || origins.some((origin) => !isHttpOrigin(origin))) {
    return undefined;
  }

  return origins;
}

function resolveCookieSecure(
  nodeEnv: 'development' | 'test' | 'production',
  sameSite: z.infer<typeof sameSiteSchema>,
  cookieSecure: 'true' | 'false' | undefined,
): boolean | undefined {
  if (sameSite === 'none' && cookieSecure === 'false') {
    return undefined;
  }

  if (sameSite === 'none') {
    return true;
  }

  if (cookieSecure === undefined) {
    return nodeEnv === 'production';
  }

  return cookieSecure === 'true';
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${message}`);
}

const clientOrigins = parseClientOrigins(parsed.data.CLIENT_ORIGIN);
const cookieSecure = resolveCookieSecure(
  parsed.data.NODE_ENV,
  parsed.data.COOKIE_SAMESITE,
  parsed.data.COOKIE_SECURE,
);

if (!clientOrigins || cookieSecure === undefined) {
  const problems: string[] = [];
  if (!clientOrigins) {
    problems.push('CLIENT_ORIGIN: must be a comma-separated list of http(s) URLs');
  }
  if (cookieSecure === undefined) {
    problems.push('COOKIE_SECURE: must be true when COOKIE_SAMESITE is none');
  }
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}`);
}

export const env = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parsed.data.PORT,
  MONGODB_URI: parsed.data.MONGODB_URI,
  JWT_ACCESS_SECRET: parsed.data.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: parsed.data.JWT_REFRESH_SECRET,
  CLIENT_ORIGIN: parsed.data.CLIENT_ORIGIN,
  clientOrigins,
  cookies: {
    httpOnly: parsed.data.COOKIE_HTTPONLY,
    secure: cookieSecure,
    sameSite: parsed.data.COOKIE_SAMESITE,
  },
};
