/**
 * Snap a typed name to an existing canonical spelling.
 * If `name` matches one of `knownNames` case-insensitively (ignoring surrounding
 * whitespace), return that known spelling; otherwise return the trimmed input.
 * Prevents "Zscale" / "ZScale" from becoming two separate clients/companies.
 */
export function canonicalizeName(name, knownNames = []) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return trimmed;
    const folded = trimmed.toLowerCase();
    const match = (knownNames || []).find((n) => String(n || '').trim().toLowerCase() === folded);
    return match ? String(match).trim() : trimmed;
}
