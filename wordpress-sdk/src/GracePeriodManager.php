<?php

namespace Wpistic;

use Wpistic\Security\TokenStorage;

/**
 * Manages grace period logic for expired licenses.
 * Allows plugins to remain functional for 7 days after expiration.
 */
class GracePeriodManager {

    /**
     * Get valid entitlements if license is still usable
     * (either active or in grace period)
     */
    public static function getValidEntitlements(): ?array {
        $cached = TokenStorage::retrieve('last_validation');
        if (!$cached) {
            return null;
        }

        // If in grace period, check if grace period hasn't ended
        if (($cached['status'] ?? null) === 'grace_period') {
            $graceEnd = $cached['grace_period_ends_at'] ?? null;
            if ($graceEnd && strtotime($graceEnd) > time()) {
                return $cached['entitlements'] ?? [];
            }
        }

        // If valid and not expired, return entitlements
        if (($cached['valid'] ?? false) === true) {
            $expiresAt = $cached['expires_at'] ?? null;
            if (!$expiresAt || strtotime($expiresAt) > time()) {
                return $cached['entitlements'] ?? [];
            }
        }

        return null;
    }

    /**
     * Check if license is in grace period
     */
    public static function isInGracePeriod(): bool {
        $cached = TokenStorage::retrieve('last_validation');
        if (!$cached) {
            return false;
        }

        if (($cached['status'] ?? null) !== 'grace_period') {
            return false;
        }

        $graceEnd = $cached['grace_period_ends_at'] ?? null;
        return $graceEnd && strtotime($graceEnd) > time();
    }

    /**
     * Get grace period end time if in grace period
     */
    public static function getGracePeriodEndsAt(): ?string {
        $cached = TokenStorage::retrieve('last_validation');
        if (!$cached || ($cached['status'] ?? null) !== 'grace_period') {
            return null;
        }

        return $cached['grace_period_ends_at'] ?? null;
    }
}
