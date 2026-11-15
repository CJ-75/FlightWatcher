/**
 * Strip junk chars that leak from iOS Notes / paste (￼ U+FFFC, etc.)
 * and collapse leftover whitespace for clean web/mobile copy.
 */
export function sanitizeUserFacingText(
  raw?: string | null,
  opts?: { multiline?: boolean },
): string {
  let s = String(raw ?? '')
  // Object replacement (￼), replacement char (), BOM / zero-width
  s = s.replace(/[\uFFFC\uFFFD\uFEFF\u200B-\u200D]/g, '')
  // Other non-printable controls except \n \r \t
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  if (opts?.multiline) {
    s = s.replace(/[ \t]+\n/g, '\n')
    s = s.replace(/\n{3,}/g, '\n\n')
    s = s.replace(/[ \t]{2,}/g, ' ')
    return s.replace(/^\s+|\s+$/g, '')
  }
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
