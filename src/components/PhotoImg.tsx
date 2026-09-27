import { TriangleAlert } from 'lucide-react';
import { markMissing, usePhotoMissing, usePhotoUrl } from '../images';

const MISSING_TIP = "This photo's image could no longer be found.";

export function PhotoImg({ id }: { id: string }) {
  const url = usePhotoUrl(id);
  const missing = usePhotoMissing(id);
  if (missing) {
    return (
      <div className="photo photo-missing">
        <span className="photo-missing-icon" data-tip={MISSING_TIP} aria-label={MISSING_TIP} role="img">
          <TriangleAlert />
        </span>
      </div>
    );
  }
  return url ? (
    <img className="photo" src={url} alt="" draggable={false} decoding="async" onError={() => markMissing(id)} />
  ) : (
    <div className="photo photo-loading" />
  );
}
