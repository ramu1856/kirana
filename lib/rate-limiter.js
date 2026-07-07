function createRateLimiter(options) {
    const windowMs = Number(options.windowMs) || 60 * 1000;
    const maxRequests = Number(options.maxRequests) || 30;
    const entries = new Map();

    function check(key) {
        const now = Date.now();
        const entry = entries.get(key);

        if (!entry || now >= entry.resetAt) {
            entries.set(key, {
                count: 1,
                resetAt: now + windowMs
            });
            prune(now);
            return {
                allowed: true,
                remaining: maxRequests - 1,
                resetAt: now + windowMs,
                retryAfterSeconds: Math.ceil(windowMs / 1000)
            };
        }

        if (entry.count >= maxRequests) {
            prune(now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.resetAt,
                retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
            };
        }

        entry.count += 1;
        prune(now);
        return {
            allowed: true,
            remaining: Math.max(0, maxRequests - entry.count),
            resetAt: entry.resetAt,
            retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
        };
    }

    function prune(now) {
        for (const [key, entry] of entries.entries()) {
            if (now >= entry.resetAt) {
                entries.delete(key);
            }
        }
    }

    return {
        check
    };
}

module.exports = {
    createRateLimiter
};
