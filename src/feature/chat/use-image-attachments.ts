import { useState } from "react";

export type AttachedImage = {
  path: string;
  previewUrl: string;
};

// 入力欄への画像D&Dと、アップロード済み画像の添付状態をまとめて持つ
export function useImageAttachments() {
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleDropImages = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/chat/image", { method: "POST", body: form });
        if (!res.ok) {
          throw new Error();
        }
        const data = await res.json();
        setImages((prev) => [...prev, { path: data.path, previewUrl: URL.createObjectURL(file) }]);
      } catch {
        /* アップロード失敗時はその画像だけ添付しない */
      }
    }
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: handleDropImages,
  };

  const removeImage = (path: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.path === path);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((img) => img.path !== path);
    });
  };

  const clearImages = () => {
    for (const img of images) {
      URL.revokeObjectURL(img.previewUrl);
    }
    setImages([]);
  };

  return { images, dragOver, dropHandlers, removeImage, clearImages };
}
