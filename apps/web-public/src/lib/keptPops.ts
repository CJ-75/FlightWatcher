const LS = 'fw_kept_pops'

export function isPopKept(key: string): boolean {
  try {
    const raw = localStorage.getItem(LS)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return list.includes(key)
  } catch {
    return false
  }
}

export function setPopKept(
  key: string,
  meta: { city: string; slug: string; title: string },
  kept: boolean,
): void {
  try {
    const raw = localStorage.getItem(LS)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    const next = kept
      ? list.includes(key)
        ? list
        : [...list, key]
      : list.filter((x) => x !== key)
    localStorage.setItem(LS, JSON.stringify(next))
    if (kept) {
      localStorage.setItem(
        `${LS}:${key}`,
        JSON.stringify({ ...meta, at: Date.now() }),
      )
    }
  } catch {
    /* ignore */
  }
}
