export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="bingo-lightbox-backdrop" onClick={onClose}>
      <img src={url} alt="" className="bingo-lightbox-img" />
    </div>
  );
}
