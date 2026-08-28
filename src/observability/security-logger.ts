export type SecurityLogLevel = "info" | "warn" | "error";
export type SecurityEventName =
  | "request.accepted"
  | "request.rejected"
  | "auth.accepted"
  | "auth.rejected"
  | "dependency.failed";
export type SecurityAuthOutcome = "accepted" | "missing" | "invalid" | "insufficient_scope";

export interface SecurityLogEvent {
  readonly level: SecurityLogLevel;
  readonly event: SecurityEventName;
  readonly status?: number;
  readonly durationMs?: number;
  readonly authOutcome?: SecurityAuthOutcome;
  readonly errorCode?: string;
  readonly tool?: string;
}

export interface SecurityLogger {
  write(event: SecurityLogEvent): void;
}

export interface SecurityLoggerOptions {
  readonly sink: (line: string) => void;
  readonly clock?: () => Date;
}

const SAFE_LABEL = /^[a-z0-9._:-]{1,64}$/u;
const LEVELS: ReadonlySet<string> = new Set(["info", "warn", "error"]);
const EVENTS: ReadonlySet<string> = new Set([
  "request.accepted",
  "request.rejected",
  "auth.accepted",
  "auth.rejected",
  "dependency.failed",
]);
const AUTH_OUTCOMES: ReadonlySet<string> = new Set([
  "accepted",
  "missing",
  "invalid",
  "insufficient_scope",
]);

function safeLabel(value: string | undefined): string | undefined {
  return value !== undefined && SAFE_LABEL.test(value) ? value : undefined;
}

function boundedInteger(value: number | undefined, maximum: number): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : undefined;
}

/**
 * Produces one-line structured events from an explicit allowlist. Unknown
 * runtime properties, headers, bodies, tokens, arbitrary errors and user
 * content are never copied to the log record.
 */
export function createSecurityLogger(options: SecurityLoggerOptions): SecurityLogger {
  const clock = options.clock ?? (() => new Date());

  return {
    write(event: SecurityLogEvent): void {
      if (!LEVELS.has(event.level) || !EVENTS.has(event.event)) {
        return;
      }
      const status = boundedInteger(event.status, 599);
      const durationMs = boundedInteger(event.durationMs, 86_400_000);
      const errorCode = safeLabel(event.errorCode);
      const tool = safeLabel(event.tool);
      const authOutcome =
        event.authOutcome !== undefined && AUTH_OUTCOMES.has(event.authOutcome)
          ? event.authOutcome
          : undefined;

      options.sink(
        JSON.stringify({
          timestamp: clock().toISOString(),
          level: event.level,
          event: event.event,
          ...(status === undefined ? {} : { status }),
          ...(durationMs === undefined ? {} : { durationMs }),
          ...(authOutcome === undefined ? {} : { authOutcome }),
          ...(errorCode === undefined ? {} : { errorCode }),
          ...(tool === undefined ? {} : { tool }),
        }),
      );
    },
  };
}
