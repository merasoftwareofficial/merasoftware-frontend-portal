import { getResourceScope, readResource } from './resourceClient';
import { beginCacheRead, cacheKey, endCacheRead, readCache, storeCache } from './resourceCache';

// Fills the cache without a screen. A failure stays silent: the screen reads for itself when opened.
export async function preloadResource(url, policy) {
  const scope = getResourceScope();
  const key = cacheKey(scope, url);
  if (readCache(key)) return;
  const read = beginCacheRead(policy);
  try {
    const data = await readResource(url);
    if (getResourceScope() === scope) storeCache(key, data, policy, read);
  } catch {
    // Nothing to keep.
  } finally {
    endCacheRead(read);
  }
}
