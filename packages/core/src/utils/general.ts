import os from "os";

export const noop = <T>(v: T): T => v

export const isWindows = os.platform() === 'win32'

export function toArray<T>(
  val: T | T[] | null | undefined,
  defaultValue?: T,
): T[] {
  if (Array.isArray(val)) {
    return val
  } else if (val == null) {
    if (defaultValue) return [defaultValue]
    return []
  } else {
    return [val]
  }
}

export function isTruthy<T>(item: T | null | undefined): item is T {
  return Boolean(item);
}

export function isObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function merge(defaults: Record<string, any>, overrides: Record<string, any>) {
  const merged: Record<string, any> = { ...defaults }
  for (const key in overrides) {
    const value = overrides[key]
    if (value == null)
      continue

    const existing = merged[key]

    if (existing == null) {
      merged[key] = value
      continue
    }
    // fields that require special handling
    if (key === 'entry') {
      merged[key] = value || existing
      continue
    }

    if (Array.isArray(existing) || Array.isArray(value)) {
      merged[key] = [...toArray(existing ?? []), ...toArray(value ?? [])]
      continue
    }
    if (isObject(existing) && isObject(value)) {
      merged[key] = merge(
        existing,
        value,
      )
      continue
    }

    merged[key] = value
  }
  return merged
}
