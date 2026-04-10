function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnakeKey(key);
    if (Array.isArray(value)) {
      result[snakeKey] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)
          ? toSnakeCase(item as Record<string, unknown>)
          : item
      );
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      result[snakeKey] = toSnakeCase(value as Record<string, unknown>);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

export function toSnakeCaseArray(arr: Record<string, unknown>[]): Record<string, unknown>[] {
  return arr.map(toSnakeCase);
}
