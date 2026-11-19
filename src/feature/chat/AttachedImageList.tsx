import { X } from "lucide-react";
import type { AttachedImage } from "./use-image-attachments";

type Props = {
  images: AttachedImage[];
  onRemove: (path: string) => void;
};

export function AttachedImageList({ images, onRemove }: Props) {
  if (images.length === 0) {
    return null;
  }
  return (
    <div className="chat-attached-images">
      {images.map((img) => (
        <div key={img.path} className="chat-attached-image">
          <img src={img.previewUrl} alt="添付画像" />
          <button type="button" className="chat-clear-btn" onClick={() => onRemove(img.path)} title="添付解除">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
