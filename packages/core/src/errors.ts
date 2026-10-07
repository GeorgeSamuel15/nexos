export type NexOSErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_INPUT'
  | 'PROTECTED_RESOURCE'
  | 'PROCESS_NOT_FOUND'
  | 'APP_NOT_FOUND'
  | 'APP_INVALID'
  | 'NETWORK_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class NexOSError extends Error {
  constructor(
    readonly code: NexOSErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string>> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NexOSError';
  }
}

export interface SerializedError {
  name: string;
  code: NexOSErrorCode;
  message: string;
  details: Readonly<Record<string, string>>;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof NexOSError) {
    return { name: error.name, code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { name: error.name, code: 'INTERNAL_ERROR', message: error.message, details: {} };
  }
  return {
    name: 'Error',
    code: 'INTERNAL_ERROR',
    message: 'An unknown NexOS error occurred.',
    details: {},
  };
}

export function assertNever(value: never, context: string): never {
  throw new NexOSError('INTERNAL_ERROR', `Unexpected ${context}: ${String(value)}`);
}
