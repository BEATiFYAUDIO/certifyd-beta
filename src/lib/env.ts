import { z } from 'zod';

const weakProductionSecrets = new Set([
  'change-me-locally',
  'replace-with-a-long-unique-password',
  'replace-with-at-least-32-random-characters',
  'very-long-local-password',
  '0123456789abcdef0123456789abcdef',
]);

const envSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'DATABASE_URL must be a PostgreSQL connection string'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  SESSION_PASSWORD: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  PUBLIC_SITE_ORIGIN: z.string().url().default('https://beta.certifyd.me'),
  BETA_ACCEPT_ORIGIN: z.string().url().optional(),
  CERTIFYD_CORE_REPOSITORY_URL: z.string().url().optional(),
  CODEX_URL: z.string().url().default('https://openai.com/codex/'),
  CLAUDE_CODE_URL: z.string().url().default('https://claude.com/product/claude-code'),
  NODE_ENV: z.string().default('development'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const [key, value] of Object.entries({ ADMIN_PASSWORD: env.ADMIN_PASSWORD, SESSION_PASSWORD: env.SESSION_PASSWORD })) {
    if (weakProductionSecrets.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must not use a known development/default value in production` });
    }
  }
  if (!env.NEXT_PUBLIC_APP_URL.startsWith('https://')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['NEXT_PUBLIC_APP_URL'], message: 'NEXT_PUBLIC_APP_URL must use https:// in production' });
  }
  if (!env.PUBLIC_SITE_ORIGIN.startsWith('https://')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_SITE_ORIGIN'], message: 'PUBLIC_SITE_ORIGIN must use https:// in production' });
  }
  if ((env.BETA_ACCEPT_ORIGIN || env.NEXT_PUBLIC_APP_URL).startsWith('http://')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BETA_ACCEPT_ORIGIN'], message: 'BETA_ACCEPT_ORIGIN or NEXT_PUBLIC_APP_URL must use https:// in production because public invite acceptance posts there' });
  }
});

export function getEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    SESSION_PASSWORD: process.env.SESSION_PASSWORD,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000',
    PUBLIC_SITE_ORIGIN: process.env.PUBLIC_SITE_ORIGIN || 'https://beta.certifyd.me',
    BETA_ACCEPT_ORIGIN: process.env.BETA_ACCEPT_ORIGIN,
    CERTIFYD_CORE_REPOSITORY_URL: process.env.CERTIFYD_CORE_REPOSITORY_URL,
    CODEX_URL: process.env.CODEX_URL || 'https://openai.com/codex/',
    CLAUDE_CODE_URL: process.env.CLAUDE_CODE_URL || 'https://claude.com/product/claude-code',
    NODE_ENV: process.env.NODE_ENV || 'development',
  });
}
