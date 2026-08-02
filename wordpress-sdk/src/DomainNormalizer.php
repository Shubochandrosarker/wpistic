<?php

namespace Wpistic;

/**
 * Normalizes domain URLs to a consistent format for license activation.
 */
class DomainNormalizer {

    /**
     * Normalize a site URL to a domain string
     */
    public static function normalize(string $url): string {
        $url = strtolower(trim($url));

        // Remove protocol
        $url = preg_replace('#^https?://#', '', $url);

        // Remove trailing slash
        $url = rtrim($url, '/');

        // Remove port number
        $url = preg_replace('#:\d+$#', '', $url);

        // Remove www prefix
        $url = preg_replace('#^www\.#', '', $url);

        return $url;
    }
}
