import { useEffect, useState } from 'react';
import { getAsset, getCachedAsset } from '@/persistence/assets';

/** URL (data URL) d'une image importée stockée dans IndexedDB. */
export function useAssetUrl(assetId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (assetId ? getCachedAsset(assetId) : undefined));
  useEffect(() => {
    let alive = true;
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    const cached = getCachedAsset(assetId);
    if (cached) setUrl(cached);
    else getAsset(assetId).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [assetId]);
  return url;
}
