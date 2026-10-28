import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { retainChatImage } from "@/utils/chatImageCache";
import { downloadBlob } from "@/utils/download";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Square preview for an image file, sharing the chat's blob cache. */
function LibraryThumb({ fileId, name }: { fileId: string; name: string }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const release = retainChatImage(fileId, (entry) => {
      if (!cancelled) setUrl(entry.url);
    });
    return () => {
      cancelled = true;
      release();
    };
  }, [fileId]);

  return (
    <div className="aspect-square overflow-hidden rounded-lg bg-surface-muted">
      {url ? (
        <img src={url} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <ImageIcon className="size-6 text-fg-muted" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const filesQuery = useQuery({
    queryKey: ["files"],
    queryFn: () => api.files.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.files.remove(id),
    onSuccess: async () => {
      toast("File deleted", "success");
      await queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to delete file", "error");
    },
  });

  async function downloadFile(id: string, name: string): Promise<void> {
    try {
      const blob = await api.files.content(id);
      downloadBlob(blob, name);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to download file", "error");
    }
  }

  const files = filesQuery.data?.files ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="text-fg-muted">
          Files you uploaded and images generated for your account. This list comes from storage, not a gallery of invented assets.
        </p>
      </div>
      {filesQuery.isLoading ? <p className="text-fg-muted">Loading files…</p> : null}
      {filesQuery.isError ? <p className="text-danger">Unable to load files.</p> : null}
      {!filesQuery.isLoading && files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-fg-muted">
          No files yet. Attachments and generated images you save will appear here.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => {
          const Icon = file.kind === "image" ? ImageIcon : FileText;
          return (
            <li key={file.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
              {file.kind === "image" ? <LibraryThumb fileId={file.id} name={file.originalName} /> : null}
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={file.originalName}>
                    {file.originalName}
                  </div>
                  <p className="text-xs text-fg-muted">
                    {file.kind} · {formatSize(file.size)} · {new Date(file.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                  onClick={() => void downloadFile(file.id, file.originalName)}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-danger"
                  aria-label={`Delete ${file.originalName}`}
                  onClick={() => {
                    if (window.confirm(`Delete ${file.originalName}?`)) {
                      deleteMutation.mutate(file.id);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
