import { proofImageUrl } from "../../services/board";

export function Lightbox({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  return (
    <div className="bingo-lightbox-backdrop" onClick={onClose}>
      <img src={proofImageUrl(url, "full")} alt="" className="bingo-lightbox-img" />
    </div>
  );
}
