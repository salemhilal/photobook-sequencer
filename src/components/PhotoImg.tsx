import { usePhotoUrl } from '../images';

export function PhotoImg({ id }: { id: string }) {
  const url = usePhotoUrl(id);
  return url ? (
    <img className="photo" src={url} alt="" draggable={false} decoding="async" />
  ) : (
    <div className="photo photo-loading" />
  );
}
