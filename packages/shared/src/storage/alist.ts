import { z } from "zod";

export const alistConfigSchema = z
  .object({
    url: z.string().url("Alist 服务地址必须是有效的 URL"),
    mountPath: z.string().min(1, "挂载路径不能为空").default("/"),
    token: z.string().optional()
  })
  .strict();

export const alistFileItemSchema = z
  .object({
    name: z.string(),
    size: z.number(),
    isDir: z.boolean(),
    modified: z.string(),
    sign: z.string().optional(),
    thumb: z.string().optional(),
    type: z.number().optional()
  })
  .strict();

export const alistAudioItemSchema = z
  .object({
    path: z.string(),
    name: z.string(),
    title: z.string(),
    artist: z.string(),
    album: z.string().nullable(),
    sizeBytes: z.number(),
    ext: z.string(),
    lrcPath: z.string().nullable().optional(),
    rawUrl: z.string().optional()
  })
  .strict();

export const alistListResponseSchema = z
  .object({
    total: z.number(),
    items: z.array(alistAudioItemSchema),
    directories: z.array(z.string()),
    currentPath: z.string()
  })
  .strict();

export const alistTestResponseSchema = z
  .object({
    ok: z.boolean(),
    message: z.string()
  })
  .strict();

export type AlistConfig = z.infer<typeof alistConfigSchema>;
export type AlistFileItem = z.infer<typeof alistFileItemSchema>;
export type AlistAudioItem = z.infer<typeof alistAudioItemSchema>;
export type AlistListResponse = z.infer<typeof alistListResponseSchema>;
export type AlistTestResponse = z.infer<typeof alistTestResponseSchema>;
