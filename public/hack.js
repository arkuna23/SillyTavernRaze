/**
 * Hijacks the global fetch API to implement request caching.
 * @param {number} ttl - Time to live in milliseconds (default: 20 seconds).
 * @returns {Function} - A function to restore the original fetch.
 */
export function enableFetchCaching(ttl = 20 * 1000) {
    // 1. Store the original fetch function to prevent infinite recursion
    const originalFetch = window.fetch;

    // 2. Initialize an in-memory cache
    // Structure: key (URL) => { data: string, init: object, expiry: number }
    const cache = new Map();

    // 3. Override window.fetch
    window.fetch = async function (resource, options = {}) {
        // --- Input Normalization ---

        // Handle cases where 'resource' is a Request object or a simple string
        const url = resource instanceof Request ? resource.url : resource;
        // Determine the HTTP method (default to GET if undefined)
        const method = (options.method || (resource instanceof Request ? resource.method : 'GET')).toUpperCase();

        // --- Cache Logic ---

        let check = true;
        if (method === 'POST') {
            if (url === '/api/settings/get')
                check = true; // get settings cache
            else if (url === '/api/settings/save') {
                cache.delete('/api/settings/get');
                check = false;
                // reset settings cache
            }
            else {
                check = false;
            }
        } else if( method === 'GET'){
            check = ['/version'].includes(url.toString());
        } else {
            check = false;
        }

        if (!check) return originalFetch(resource, options);

        const cacheKey = url;
        const cachedEntry = cache.get(cacheKey);
        const now = Date.now();

        // Check if cache exists and is valid (not expired)
        if (cachedEntry) {
            if (now < cachedEntry.expiry) {
                // console.log(`[Fetch Cache] Hit: ${url}`);

                // We must return a NEW Response object.
                // Reusing an old Response object is invalid if its body was already consumed.
                console.log('hit cache', url);
                return new Response(cachedEntry.data, cachedEntry.init);
            } else {
                // Clean up expired cache
                // console.log(`[Fetch Cache] Expired: ${url}`);
                cache.delete(cacheKey);
            }
        }

        // --- Network Request ---

        // console.log(`[Fetch Cache] Miss: ${url}`);
        const response = await originalFetch(resource, options);

        // Only cache successful responses (HTTP 200-299)
        if (response.ok) {
            try {
                // CRITICAL: The Response body is a stream that can only be read once.
                // We must .clone() it: one for the cache to read, one to return to the caller.
                const responseClone = response.clone();
                const responseText = await responseClone.text();

                // Store metadata required to reconstruct the Response object later
                const responseInit = {
                    status: response.status,
                    statusText: response.statusText,
                    headers: new Headers(response.headers), // Clone headers
                };

                cache.set(cacheKey, {
                    data: responseText,
                    init: responseInit,
                    expiry: now + ttl,
                });
            } catch (err) {
                console.error('[Fetch Cache] Error caching response:', err);
            }
        }

        return response;
    };

    // Return a function to restore the original fetch behavior
    return () => {
        window.fetch = originalFetch;
        cache.clear();
        console.log('[Fetch Cache] Disabled and cache cleared.');
    };
}

enableFetchCaching();
