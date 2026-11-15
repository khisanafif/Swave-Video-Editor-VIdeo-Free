import path from 'node:path';
/**
 * Sanitize user-provided filenames so they cannot escape target directories
 * or contain control/shell characters.
 */
export function sanitizeFilename(rawName) {
    const base = path.basename(rawName.trim().replaceAll('\\', '/'));
    const cleaned = base
        .replace(/[^\w.\-() ]+/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/^\.+/, '');
    return cleaned.length > 0 ? cleaned : 'media.bin';
}
/**
 * Resolve a relative path strictly inside rootDir, throwing if traversal occurs.
 */
export function resolveSafeStoragePath(rootDir, relativePath) {
    const resolvedRoot = path.resolve(rootDir);
    const cleanedRelative = relativePath.replace(/^[/\\]+/, '');
    const candidate = path.resolve(resolvedRoot, cleanedRelative);
    const relativeCheck = path.relative(resolvedRoot, candidate);
    if (relativeCheck === '' ||
        relativeCheck.startsWith('..') ||
        path.isAbsolute(relativeCheck)) {
        throw new Error(`Unsafe storage path access denied: ${relativePath}`);
    }
    return candidate;
}
