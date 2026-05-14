"use client";

import { useState, useRef } from "react";
import { Camera, Upload, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiptInputProps {
  onImageSelect: (file: File | null) => void;
  selectedImage: File | null;
}

export function ReceiptInput({ onImageSelect, selectedImage }: ReceiptInputProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    onImageSelect(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        영수증 사진
      </h2>

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="영수증 미리보기"
            className="w-full rounded-xl border border-border object-contain max-h-80"
          />
          <button
            onClick={clearImage}
            className="absolute top-2 right-2 p-2 bg-foreground/80 text-background rounded-full hover:bg-foreground/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center bg-muted/20">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-muted-foreground mb-4">
            영수증 사진을 업로드하세요
          </p>
          <div className="flex justify-center gap-3">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              className="gap-2"
            >
              <Camera className="w-4 h-4" />
              카메라
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              갤러리
            </Button>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-sm text-center text-muted-foreground">
            영수증 인식 기능은 준비 중입니다.
            <br />
            지금은 수동으로 항목을 입력해주세요.
          </p>
        </div>
      )}
    </div>
  );
}
