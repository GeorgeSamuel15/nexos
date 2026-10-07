import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXOS_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NEXOS_DEVTOOLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NEXOS_AI_PROVIDER: z.enum(['mock']).default('mock'),
});

export type NexOSEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): NexOSEnvironment {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid NexOS environment: ${details}`);
  }
  return result.data;
}
