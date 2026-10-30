import { useCallback, useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, Upload } from 'lucide-react';

interface UploadDropzoneProps {
  disabled?: boolean;
  onFile: (file: File) => void;
}

export function UploadDropzone({ disabled = false, onFile }: UploadDropzoneProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const takeFile = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      onFile(file);
    },
    [disabled, onFile]
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        takeFile(event.dataTransfer.files[0]);
      }}
      className={`rounded-3xl border p-5 transition-colors ${
        isDragging
          ? 'border-[#D4AF37] bg-[#121212]'
          : 'border-[rgba(212,175,55,0.22)] bg-[#121212]'
      }`}
    >
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.22)] bg-[#0A0A0A] text-[#D4AF37]">
          <Upload className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold tracking-tight text-[#F5F5F5]">
          Drop a UK statement
        </h2>
        <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-[#A0A0A0]">
          Camera, gallery, or PDF. Processed on-device. Bank data never leaves this phone.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border border-[rgba(212,175,55,0.22)] bg-[#0A0A0A] px-2 py-3 text-[11px] font-semibold text-[#D4AF37] disabled:opacity-40"
        >
          <Camera className="h-4 w-4" />
          Camera
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => galleryRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border border-[rgba(212,175,55,0.22)] bg-[#0A0A0A] px-2 py-3 text-[11px] font-semibold text-[#D4AF37] disabled:opacity-40"
        >
          <ImageIcon className="h-4 w-4" />
          Gallery
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => pdfRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border border-[rgba(212,175,55,0.22)] bg-[#0A0A0A] px-2 py-3 text-[11px] font-semibold text-[#D4AF37] disabled:opacity-40"
        >
          <FileText className="h-4 w-4" />
          PDF
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          takeFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          takeFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          takeFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
