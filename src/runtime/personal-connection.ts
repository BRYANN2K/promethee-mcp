import { z } from "zod";

import { validateSupabasePrometheeFacadeConfiguration, type SupabaseFetch } from "../adapters/supabase/index.js";
import type { PersonalSessionPersistence } from "./encrypted-personal-session-file.js";

const PROMETHEE_SUPABASE_ORIGIN = "https://auth.promethee.io";
const MAX_TOKEN_BYTES = 8_192;
const MIN_REFRESH_TOKEN_BYTES = 12;
const MAX_RESPONSE_BYTES = 32 * 1024;
const REFRESH_EARLY_MS = 60_000;
const COMPACT_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const OPAQUE_REFRESH_PATTERN = /^[A-Za-z0-9._~-]+$/u;
export const SEVEN_DAY_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

const connectionInputSchema = z.object({
  supabaseUrl: z.literal(PROMETHEE_SUPABASE_ORIGIN),
  publishableKey: z.string().min(24).max(1_024),
  accessToken: z.string().min(16).max(MAX_TOKEN_BYTES).regex(COMPACT_JWT_PATTERN),
  refreshToken: z.string().min(MIN_REFRESH_TOKEN_BYTES).max(MAX_TOKEN_BYTES).regex(OPAQUE_REFRESH_PATTERN),
  expiresAt: z.number().int().positive(),
}).strict();

const userSchema = z.object({ id: z.string().uuid() }).passthrough();
const refreshSchema = z.object({
  access_token: z.string().min(16).max(MAX_TOKEN_BYTES).regex(COMPACT_JWT_PATTERN),
  refresh_token: z.string().min(MIN_REFRESH_TOKEN_BYTES).max(MAX_TOKEN_BYTES).regex(OPAQUE_REFRESH_PATTERN),
  expires_in: z.number().int().positive().max(86_400),
  user: userSchema,
}).passthrough();
const storedSessionSchema = connectionInputSchema.extend({
  subject: z.string().uuid(),
  retainedUntil: z.number().int().positive(),
}).strict();
const persistedStateSchema = z.discriminatedUnion("mode", [
  z.object({ version: z.literal(1), mode: z.literal("memory") }).strict(),
  z.object({
    version: z.literal(1),
    mode: z.literal("seven-days"),
    session: storedSessionSchema.optional(),
  }).strict(),
]);

export type PersonalConnectionInput = z.infer<typeof connectionInputSchema>;

export interface PersonalConnection {
  readonly subject: string;
  readonly supabaseUrl: typeof PROMETHEE_SUPABASE_ORIGIN;
  readonly publishableKey: string;
  readonly accessToken: string;
  readonly expiresAt: number;
}

export interface PersonalConnectionStatus {
  readonly connected: boolean;
  readonly expiresAt?: number;
}

export interface PersonalConnectionStoreOptions {
  readonly fetch?: SupabaseFetch;
  readonly now?: () => number;
  readonly persistence?: PersonalSessionPersistence;
  readonly defaultRetention?: PersonalSessionRetention;
}

type StoredSession = PersonalConnection & Readonly<{ refreshToken: string }>;
type PersistedState = z.infer<typeof persistedStateSchema>;
type RefreshOperation = Readonly<{
  generation: number;
  session: StoredSession;
  promise: Promise<StoredSession>;
}>;
export type PersonalSessionRetention = "memory" | "seven-days";

export interface PersonalRetentionStatus {
  readonly mode: PersonalSessionRetention;
  readonly retainedUntil?: number;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Authentication failures never expose provider response bodies.
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json" || response.body === null) {
    await discardBody(response);
    throw new Error("invalid_upstream_response");
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
    await discardBody(response);
    throw new Error("invalid_upstream_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("invalid_upstream_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error("invalid_upstream_response");
  }
}

export class PersonalConnectionStore {
  readonly #fetch: SupabaseFetch;
  readonly #now: () => number;
  readonly #persistence: PersonalSessionPersistence | undefined;
  #session: StoredSession | undefined;
  #sessionGeneration = 0;
  #refreshing: RefreshOperation | undefined;
  #retentionMode: PersonalSessionRetention;
  #retainedUntil: number | undefined;

  public constructor(options: PersonalConnectionStoreOptions = {}) {
    this.#fetch = options.fetch ?? ((request) => globalThis.fetch(request));
    this.#now = options.now ?? Date.now;
    this.#persistence = options.persistence;
    this.#retentionMode = options.defaultRetention ?? "memory";
    if (this.#retentionMode === "seven-days" && this.#persistence === undefined) {
      throw new TypeError("Seven-day retention requires encrypted persistence");
    }
    this.#restore();
  }

  #restore(): void {
    if (this.#persistence === undefined) return;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let stored: unknown | null;
      try {
        stored = this.#persistence.load();
      } catch {
        throw new Error("session_persistence_failed");
      }
      if (stored === null) {
        this.#session = undefined;
        this.#retainedUntil = undefined;
        return;
      }

      const parsed = persistedStateSchema.safeParse(stored);
      if (!parsed.success) {
        try {
          if (this.#persistence.compareAndSwap(stored, { version: 1, mode: this.#retentionMode })) {
            this.#session = undefined;
            this.#retainedUntil = undefined;
            return;
          }
        } catch {
          throw new Error("session_persistence_failed");
        }
        continue;
      }

      const state = parsed.data;
      if (state.mode === "memory" || state.session === undefined) {
        this.#retentionMode = state.mode;
        this.#session = undefined;
        this.#retainedUntil = undefined;
        return;
      }
      if (state.session.retainedUntil <= this.#now()) {
        try {
          if (this.#persistence.compareAndSwap(state, { version: 1, mode: "seven-days" })) {
            this.#retentionMode = "seven-days";
            this.#session = undefined;
            this.#retainedUntil = undefined;
            return;
          }
        } catch {
          throw new Error("session_persistence_failed");
        }
        continue;
      }

      try {
        validateSupabasePrometheeFacadeConfiguration({
          baseUrl: state.session.supabaseUrl,
          publishableKey: state.session.publishableKey,
        });
      } catch {
        try {
          if (this.#persistence.compareAndSwap(state, { version: 1, mode: state.mode })) {
            this.#retentionMode = state.mode;
            this.#session = undefined;
            this.#retainedUntil = undefined;
            return;
          }
        } catch {
          throw new Error("session_persistence_failed");
        }
        continue;
      }

      this.#retentionMode = state.mode;
      this.#session = {
        subject: state.session.subject,
        supabaseUrl: state.session.supabaseUrl,
        publishableKey: state.session.publishableKey,
        accessToken: state.session.accessToken,
        refreshToken: state.session.refreshToken,
        expiresAt: state.session.expiresAt,
      };
      this.#retainedUntil = state.session.retainedUntil;
      return;
    }
    throw new Error("session_changed");
  }

  #restoreIfDisconnected(): void {
    if (this.#session === undefined) this.#restore();
  }

  #state(
    session: StoredSession | undefined = this.#session,
    retainedUntil: number | undefined = this.#retainedUntil,
  ): PersistedState {
    if (
      this.#retentionMode === "seven-days" &&
      retainedUntil !== undefined &&
      session !== undefined
    ) {
      return {
        version: 1,
        mode: "seven-days",
        session: { ...session, retainedUntil },
      };
    }
    return { version: 1, mode: this.#retentionMode };
  }

  #persistState(): void {
    this.#persistence?.save(this.#state());
  }

  #adoptPersistedState(): StoredSession | undefined {
    this.#sessionGeneration += 1;
    this.#session = undefined;
    this.#retainedUntil = undefined;
    this.#restore();
    return this.#session;
  }

  #expireSession(): void {
    this.#sessionGeneration += 1;
    this.#session = undefined;
    this.#retainedUntil = undefined;
    try {
      this.#persistState();
    } catch {
      this.#persistence?.clear();
    }
  }

  #expireRetentionIfNeeded(): boolean {
    if (
      this.#retentionMode !== "seven-days" ||
      this.#retainedUntil === undefined ||
      this.#retainedUntil > this.#now()
    ) {
      return false;
    }
    if (this.#persistence !== undefined && this.#session !== undefined) {
      const expected = this.#state();
      const expired = this.#state(undefined, undefined);
      if (!this.#persistence.compareAndSwap(expected, expired)) {
        this.#adoptPersistedState();
        return this.#expireRetentionIfNeeded();
      }
      this.#sessionGeneration += 1;
      this.#session = undefined;
      this.#retainedUntil = undefined;
      return true;
    }
    this.#expireSession();
    return true;
  }

  public status(): PersonalConnectionStatus {
    this.#restoreIfDisconnected();
    this.#expireRetentionIfNeeded();
    return this.#session === undefined
      ? { connected: false }
      : { connected: true, expiresAt: this.#session.expiresAt };
  }

  public retention(): PersonalRetentionStatus {
    this.#restoreIfDisconnected();
    this.#expireRetentionIfNeeded();
    return this.#retainedUntil === undefined
      ? { mode: this.#retentionMode }
      : { mode: this.#retentionMode, retainedUntil: this.#retainedUntil };
  }

  public setRetention(mode: PersonalSessionRetention): PersonalRetentionStatus {
    if (mode === "seven-days" && this.#persistence === undefined) {
      throw new Error("persistence_unavailable");
    }
    if (this.#persistence === undefined) {
      this.#retentionMode = mode;
      this.#retainedUntil = undefined;
      return { mode: this.#retentionMode };
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      let persisted: PersistedState | null;
      try {
        const loaded = this.#persistence.load();
        persisted = loaded === null ? null : persistedStateSchema.parse(loaded);
      } catch {
        throw new Error("session_persistence_failed");
      }

      const latestSession = persisted?.mode === "seven-days"
        ? persisted.session === undefined
          ? undefined
          : {
              subject: persisted.session.subject,
              supabaseUrl: persisted.session.supabaseUrl,
              publishableKey: persisted.session.publishableKey,
              accessToken: persisted.session.accessToken,
              refreshToken: persisted.session.refreshToken,
              expiresAt: persisted.session.expiresAt,
            }
        : this.#retentionMode === "memory"
          ? this.#session
          : undefined;
      const retainedUntil = mode === "seven-days" && latestSession !== undefined
        ? this.#now() + SEVEN_DAY_RETENTION_MS
        : undefined;
      const next: PersistedState = mode === "seven-days" && latestSession !== undefined && retainedUntil !== undefined
        ? { version: 1, mode, session: { ...latestSession, retainedUntil } }
        : { version: 1, mode };

      let swapped: boolean;
      try {
        swapped = this.#persistence.compareAndSwap(persisted, next);
      } catch {
        throw new Error("session_persistence_failed");
      }
      if (!swapped) continue;

      this.#sessionGeneration += 1;
      this.#retentionMode = mode;
      this.#session = latestSession;
      this.#retainedUntil = retainedUntil;
      return this.#retainedUntil === undefined
        ? { mode: this.#retentionMode }
        : { mode: this.#retentionMode, retainedUntil: this.#retainedUntil };
    }
    throw new Error("session_changed");
  }

  public disconnect(): void {
    this.#expireSession();
  }

  public async connect(input: unknown, signal?: AbortSignal): Promise<PersonalConnection> {
    const parsed = connectionInputSchema.safeParse(input);
    if (!parsed.success) throw new TypeError("invalid_connection");
    validateSupabasePrometheeFacadeConfiguration({
      baseUrl: parsed.data.supabaseUrl,
      publishableKey: parsed.data.publishableKey,
    });

    const response = await this.#fetch(new Request(new URL("/auth/v1/user", parsed.data.supabaseUrl), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${parsed.data.accessToken}`,
        apikey: parsed.data.publishableKey,
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      ...(signal === undefined ? {} : { signal }),
    }));
    if (!response.ok) {
      await discardBody(response);
      throw new Error("identity_rejected");
    }
    const user = userSchema.safeParse(await readBoundedJson(response));
    if (!user.success) throw new Error("identity_rejected");

    const session: StoredSession = {
      subject: user.data.id,
      supabaseUrl: parsed.data.supabaseUrl,
      publishableKey: parsed.data.publishableKey,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
      expiresAt: parsed.data.expiresAt,
    };
    const previousSession = this.#session;
    const previousRetainedUntil = this.#retainedUntil;
    this.#sessionGeneration += 1;
    this.#session = session;
    if (this.#retentionMode === "seven-days") {
      this.#retainedUntil = this.#now() + SEVEN_DAY_RETENTION_MS;
      try {
        this.#persistState();
      } catch (error) {
        this.#sessionGeneration += 1;
        this.#session = previousSession;
        this.#retainedUntil = previousRetainedUntil;
        throw error;
      }
    }
    if (session.expiresAt <= this.#now() + REFRESH_EARLY_MS) {
      return this.#refresh(session, signal);
    }
    return session;
  }

  public async current(signal?: AbortSignal): Promise<PersonalConnection | null> {
    this.#restoreIfDisconnected();
    const session = this.#session;
    if (session === undefined) return null;
    if (this.#expireRetentionIfNeeded()) return null;
    if (session.expiresAt > this.#now() + REFRESH_EARLY_MS) return session;
    return this.#refresh(session, signal);
  }

  #rejectRefresh(session: StoredSession, generation: number): StoredSession | undefined {
    if (this.#sessionGeneration !== generation || this.#session !== session) {
      throw new Error("session_changed");
    }
    if (this.#retentionMode === "seven-days" && this.#persistence !== undefined) {
      const expected = this.#state(session, this.#retainedUntil);
      const expired = this.#state(undefined, undefined);
      let swapped: boolean;
      try {
        swapped = this.#persistence.compareAndSwap(expected, expired);
      } catch {
        throw new Error("session_persistence_failed");
      }
      if (!swapped) return this.#adoptPersistedState();
      this.#sessionGeneration += 1;
      this.#session = undefined;
      this.#retainedUntil = undefined;
      return undefined;
    }
    this.#expireSession();
    return undefined;
  }

  async #refresh(session: StoredSession, signal?: AbortSignal): Promise<StoredSession> {
    const generation = this.#sessionGeneration;
    if (
      this.#refreshing !== undefined &&
      this.#refreshing.generation === generation &&
      this.#refreshing.session === session
    ) {
      return this.#refreshing.promise;
    }
    const promise = (async () => {
      const url = new URL("/auth/v1/token", session.supabaseUrl);
      url.searchParams.set("grant_type", "refresh_token");
      const response = await this.#fetch(new Request(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session.publishableKey}`,
          "Content-Type": "application/json",
          apikey: session.publishableKey,
        },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        ...(signal === undefined ? {} : { signal }),
      }));
      if (!response.ok) {
        await discardBody(response);
        const adopted = this.#rejectRefresh(session, generation);
        if (adopted !== undefined) return adopted;
        throw new Error("session_expired");
      }
      const parsed = refreshSchema.safeParse(await readBoundedJson(response));
      if (!parsed.success || parsed.data.user.id !== session.subject) {
        const adopted = this.#rejectRefresh(session, generation);
        if (adopted !== undefined) return adopted;
        throw new Error("session_expired");
      }
      if (this.#sessionGeneration !== generation || this.#session !== session) {
        throw new Error("session_changed");
      }
      const refreshed: StoredSession = {
        subject: session.subject,
        supabaseUrl: session.supabaseUrl,
        publishableKey: session.publishableKey,
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
        expiresAt: this.#now() + parsed.data.expires_in * 1_000,
      };
      if (this.#retentionMode === "seven-days" && this.#persistence !== undefined) {
        let swapped: boolean;
        try {
          swapped = this.#persistence.compareAndSwap(
            this.#state(session, this.#retainedUntil),
            this.#state(refreshed, this.#retainedUntil),
          );
        } catch {
          throw new Error("session_persistence_failed");
        }
        if (!swapped) {
          const adopted = this.#adoptPersistedState();
          if (adopted !== undefined) return adopted;
          throw new Error("session_changed");
        }
      }
      this.#sessionGeneration += 1;
      this.#session = refreshed;
      if (this.#retentionMode !== "seven-days") {
        try {
          this.#persistState();
        } catch {
          this.#expireSession();
          throw new Error("session_persistence_failed");
        }
      }
      return refreshed;
    })();
    const operation: RefreshOperation = { generation, session, promise };
    this.#refreshing = operation;
    try {
      return await promise;
    } finally {
      if (this.#refreshing === operation) this.#refreshing = undefined;
    }
  }
}
