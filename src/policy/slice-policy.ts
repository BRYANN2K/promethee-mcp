import { z } from "zod";

const slicePolicySchema = z
  .object({
    defaultPageSize: z.number().int().min(1),
    maxPageSize: z.number().int().min(1),
    maxIdentifierBytes: z.number().int().min(1),
    maxTextBytes: z.number().int().min(1),
    maxCursorBytes: z.number().int().min(64),
    maxBackendPageTokenBytes: z.number().int().min(1),
    maxSourceVersionBytes: z.number().int().min(1),
    maxResponseBytes: z.number().int().min(1),
    upstreamTimeoutMs: z.number().int().min(1),
    cursorTtlMs: z.number().int().min(1),
    orderingVersion: z.string().min(1),
  })
  .strict()
  .refine((value) => value.defaultPageSize <= value.maxPageSize, {
    message: "defaultPageSize must not exceed maxPageSize",
  });

export type SlicePolicy = Readonly<z.infer<typeof slicePolicySchema>>;

export function defineSlicePolicy(input: unknown): SlicePolicy {
  return Object.freeze(slicePolicySchema.parse(input));
}

/** Small deterministic bounds for synthetic tests; not a production policy. */
export const SYNTHETIC_SLICE_POLICY = defineSlicePolicy({
  defaultPageSize: 2,
  maxPageSize: 3,
  maxIdentifierBytes: 64,
  maxTextBytes: 128,
  maxCursorBytes: 512,
  maxBackendPageTokenBytes: 64,
  maxSourceVersionBytes: 64,
  maxResponseBytes: 16 * 1024,
  upstreamTimeoutMs: 25,
  cursorTtlMs: 60_000,
  orderingVersion: "id-asc-v1",
});
