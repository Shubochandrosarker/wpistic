<?php

namespace Wpistic;

/**
 * Normalizes domain URLs to a consistent format for license activation.
 */
class DomainNormalizer {

    /**
     * Normalize a site URL to a domain string.
     *
     * Must match normalizeDomain() in
     * wpistic-platform/apps/api/src/utils/domain.ts — the API normalizes
     * the domain it stores on activation, and validation compares against
     * it, so a subdirectory install (example.com/blog) has to normalize to
     * the same bare domain on both sides.
     */
    public static function normalize(string $url): string {
        $domain = strtolower(trim($url));

        // Remove protocol (any scheme)
        $domain = preg_replace('#^[a-z][a-z0-9+.\-]*://#', '', $domain);

        // Remove credentials
        $domain = preg_replace('#^[^@/]+@#', '', $domain);

        // Remove path, query string, and fragment
        $domain = preg_split('#[/?\#]#', $domain)[0];

        // Remove port number
        $domain = preg_replace('#:\d+$#', '', $domain);

        // Remove trailing dots
        $domain = rtrim($domain, '.');

        // Remove www prefix (same length guard as the API)
        if (strpos($domain, 'www.') === 0 && strlen($domain) > 8) {
            $domain = substr($domain, 4);
        }

        return $domain;
    }
}
