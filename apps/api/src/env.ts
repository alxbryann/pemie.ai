import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me-please"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  // Origen público del API (para construir redirect_uri de OAuth en prod).
  PUBLIC_API_URL: z.string().optional(),

  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),

  // Envío de correo (invitaciones). Si RESEND_API_KEY está vacío, el mailer
  // cae a modo dev: registra el link de aceptación en consola en vez de enviar.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("pemie.ai <onboarding@resend.dev>"),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
