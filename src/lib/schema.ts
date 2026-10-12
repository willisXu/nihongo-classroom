/** JSON schema 小工具（結構化輸出用：每個物件都要 additionalProperties: false） */
export function obj(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
export function arr(items: Record<string, unknown>): Record<string, unknown> {
  return { type: 'array', items };
}
export const S = { type: 'string' } as const;
export const B = { type: 'boolean' } as const;
export const I = { type: 'integer' } as const;
