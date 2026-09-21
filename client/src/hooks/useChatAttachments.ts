import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ModelCapability, PublicFile } from "@Ken/shared";
import { api, ApiError } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { attachmentRejection } from "@/utils/attachmentGate";
import { fileIdentityKey } from "@/utils/composerPaste";

export function useChatAttachments(options: {
  capabilities: ModelCapability[];
  imageDisabledReason?: string;
  draft: string;
}): {
  attachments: PublicFile[];
  uploading: boolean;
  generatingImage: boolean;
  webSearch: boolean;
  setWebSearch: Dispatch<SetStateAction<boolean>>;
  onAddFiles: (files: File[]) => Promise<void>;
  onRemoveAttachment: (fileId: string) => void;
  onGenerateImage: () => Promise<void>;
  clearAttachments: () => void;
} {
  const { capabilities, imageDisabledReason, draft } = options;
  const [attachments, setAttachments] = useState<PublicFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const seenKeysRef = useRef(new Set<string>());

  async function onAddFiles(fileList: File[]): Promise<void> {
    setUploading(true);
    try {
      for (const file of fileList) {
        const key = fileIdentityKey(file);
        if (seenKeysRef.current.has(key)) continue;
        const reason = attachmentRejection(file, capabilities);
        if (reason) {
          toast(reason, "error");
          continue;
        }
        seenKeysRef.current.add(key);
        try {
          const uploaded = await api.files.upload(file);
          setAttachments((current) => {
            const duplicate = current.some(
              (item) => item.originalName === uploaded.file.originalName && item.size === uploaded.file.size,
            );
            return duplicate ? current : [...current, uploaded.file];
          });
        } catch (err) {
          seenKeysRef.current.delete(key);
          toast(err instanceof ApiError ? err.message : "Unable to upload file", "error");
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function onGenerateImage(): Promise<void> {
    const prompt = draft.trim();
    if (!prompt) {
      toast("Enter a prompt to generate an image.", "error");
      return;
    }
    if (imageDisabledReason) {
      toast(imageDisabledReason, "error");
      return;
    }
    setGeneratingImage(true);
    try {
      const generated = await api.tools.generateImage({ prompt });
      setAttachments((current) => [...current, generated.file]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Image generation is not configured.", "error");
    } finally {
      setGeneratingImage(false);
    }
  }

  return {
    attachments,
    uploading,
    generatingImage,
    webSearch,
    setWebSearch,
    onAddFiles,
    onRemoveAttachment: (fileId) => {
      setAttachments((current) => {
        const next = current.filter((item) => item.id !== fileId);
        seenKeysRef.current = new Set(next.map((item) => `${item.originalName}:${item.size}:${item.mimeType}`));
        return next;
      });
    },
    onGenerateImage,
    clearAttachments: () => {
      seenKeysRef.current.clear();
      setAttachments([]);
    },
  };
}
