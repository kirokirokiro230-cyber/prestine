"use client";

import { useCallback, useId, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Image as ImageIcon, Spinner, Trash, UploadSimple } from "@phosphor-icons/react";
import { uploadImageAction } from "@/app/admin/actions/uploads";
import { canOptimiseImage } from "@/lib/image-hosts";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_ACCEPT,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";

/**
 * Image upload for the admin panel: drag a file in, or click to pick one.
 *
 * Uploads happen on drop, not on form submit. The merchant sees the picture straight
 * away, and the surrounding form only ever carries the resulting URL in a hidden input —
 * so the product and banner forms stay plain field submissions with no multipart handling
 * and no half-saved state where the file landed but the record did not.
 *
 * Notes on the parts that are easy to get wrong:
 *
 * - **The drop target is a real `<button>` wrapping a hidden `<input type="file">`.** A
 *   styled `<div>` with a click handler cannot be reached by Tab and does not respond to
 *   Enter or Space, which makes uploading impossible without a mouse.
 * - **`dragenter`/`dragleave` are counted, not toggled.** Dragging over a child element
 *   fires `dragleave` on the parent, so a boolean flickers the highlight off mid-drag.
 * - **`dragover` must call `preventDefault`.** Without it the browser navigates away to
 *   open the file, losing the half-filled form.
 * - **Files are validated in the browser and again on the server.** The browser check
 *   only saves a pointless 6MB round trip; the server trusts none of it and sniffs the
 *   actual bytes.
 */

/**
 * Preview thumbnail.
 *
 * A record saved earlier may hold an image on a host the optimiser does not allow, and
 * `next/image` throws rather than degrading — which would take down the admin form used
 * to correct it. Falls back to a plain `<img>` for anything unrecognised.
 */
function Thumb({ url, sizes }: { url: string; sizes: string }) {
  if (!canOptimiseImage(url)) {
    return (
      /*
       * The optimiser refuses this host and throws. An 80px admin thumbnail is not worth
       * crashing the very form that exists to correct the URL.
       */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
    );
  }
  return <Image src={url} alt="" fill sizes={sizes} className="object-cover" />;
}

/** Local pre-flight. The server repeats all of this and does not rely on it. */
function rejectionReason(file: File): string | null {
  if (file.size === 0) return "That file is empty.";

  if (file.size > MAX_UPLOAD_BYTES) {
    return `That image is ${(file.size / (1024 * 1024)).toFixed(1)}MB. The limit is ${MAX_UPLOAD_LABEL}.`;
  }

  /**
   * `file.type` is only a hint — the browser guesses it from the extension and the
   * server ignores it entirely. It is checked here purely so an obvious mistake fails
   * instantly, and an empty type is allowed through rather than blocking a valid image
   * the OS simply did not label.
   */
  if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type as never)) {
    return "Use a JPEG, PNG, WebP, AVIF or GIF. SVG is not accepted.";
  }

  return null;
}

/** Shared upload plumbing: validate, send, report. */
function useUploader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (files: File[]): Promise<string[]> => {
    setError(null);

    const rejected = files.map(rejectionReason).find(Boolean);
    if (rejected) {
      setError(rejected);
      return [];
    }

    setBusy(true);
    const urls: string[] = [];

    try {
      // Sequential rather than parallel. A merchant dropping eight photos on a phone
      // tether should not open eight simultaneous uploads and have them all time out.
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);

        const result = await uploadImageAction({}, body);

        if (result.error) {
          setError(result.error);
          break;
        }
        if (result.url) urls.push(result.url);
      }
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }

    return urls;
  }, []);

  return { busy, error, setError, upload };
}

/** Counts drag enter/leave so a child element cannot flicker the highlight off. */
function useDragDepth() {
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  return {
    over,
    handlers: {
      onDragEnter: (event: React.DragEvent) => {
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (event: React.DragEvent) => {
        // Without this the browser opens the file and abandons the form.
        event.preventDefault();
      },
      onDragLeave: (event: React.DragEvent) => {
        event.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setOver(false);
        }
      },
      reset: () => {
        depth.current = 0;
        setOver(false);
      },
    },
  };
}

const DROP_ZONE_CLASS =
  "flex w-full flex-col items-center justify-center gap-2 border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60";

function DropZone({
  label,
  hint,
  multiple,
  busy,
  over,
  onFiles,
  dragHandlers,
}: {
  label: string;
  hint: string;
  multiple: boolean;
  busy: boolean;
  over: boolean;
  onFiles: (files: File[]) => void;
  dragHandlers: ReturnType<typeof useDragDepth>["handlers"];
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      // A button, not a div: reachable by Tab, and Enter and Space already work.
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      aria-describedby={undefined}
      className={cn(DROP_ZONE_CLASS, over && "border-accent bg-accent-soft")}
      onDragEnter={dragHandlers.onDragEnter}
      onDragOver={dragHandlers.onDragOver}
      onDragLeave={dragHandlers.onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        dragHandlers.reset();
        const files = Array.from(event.dataTransfer.files);
        onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      {busy ? (
        <Spinner size={20} aria-hidden className="animate-spin text-content-muted" />
      ) : (
        <UploadSimple size={20} aria-hidden className="text-content-muted" />
      )}

      <span className="text-xs font-medium text-content">
        {busy ? "Uploading…" : label}
      </span>
      <span className="text-2xs text-content-muted">{hint}</span>

      {/*
        The real input, visually hidden but still in the accessibility tree so screen
        readers announce a file input and native validation still applies. `sr-only`
        rather than `display: none`, which would make it unfocusable.
      */}
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple={multiple}
        className="sr-only"
        // Reset the value so choosing the same file twice fires `change` again.
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(files);
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </button>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p role="alert" className="text-xs text-danger-500 dark:text-danger-100">
      {message}
    </p>
  );
}

/**
 * One image, submitted as a single hidden field.
 *
 * Used for the banner artwork. The value is kept in state and mirrored into the hidden
 * input, so the surrounding form submits exactly what it did when this was a URL box.
 */
export function ImageUploadField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const { busy, error, setError, upload } = useUploader();
  const { over, handlers } = useDragDepth();
  const fieldId = useId();

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const [uploaded] = await upload(files.slice(0, 1));
    if (uploaded) setUrl(uploaded);
  };

  return (
    <div className="flex flex-col gap-2">
      <span
        id={fieldId}
        className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted"
      >
        {label}
      </span>

      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="flex items-start gap-3 border border-line p-2">
          <div className="relative size-20 shrink-0 overflow-hidden bg-surface-sunken">
            <Thumb url={url} sizes="80px" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="truncate font-mono text-2xs text-content-muted">{url}</p>
            <button
              type="button"
              onClick={() => {
                setUrl("");
                setError(null);
              }}
              className="inline-flex w-fit items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.12em] text-danger-500 hover:underline"
            >
              <Trash size={13} aria-hidden />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <DropZone
          label="Drop an image here, or click to choose"
          hint={hint ?? `JPEG, PNG, WebP, AVIF or GIF · up to ${MAX_UPLOAD_LABEL}`}
          multiple={false}
          busy={busy}
          over={over}
          onFiles={onFiles}
          dragHandlers={handlers}
        />
      )}

      <ErrorNote message={error} />
    </div>
  );
}

/**
 * An ordered set of images, submitted as one newline-separated hidden field.
 *
 * Used for colourway photography. Newline-separated because that is exactly what the
 * textarea it replaces produced, so the server action's parsing is untouched.
 *
 * Order is meaningful — front, detail, back, on-figure — so the arrows are part of the
 * feature, not a nicety. They are buttons with real labels rather than drag handles:
 * dragging to reorder is unusable by keyboard and fiddly on a phone.
 */
export function ImageUploadList({
  name,
  label,
  hint,
  defaultValue,
  max = 4,
  slotLabels,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string[];
  max?: number;
  /** Names the position of each image, e.g. front / detail / back. */
  slotLabels?: string[];
}) {
  const [urls, setUrls] = useState<string[]>(defaultValue ?? []);
  const { busy, error, setError, upload } = useUploader();
  const { over, handlers } = useDragDepth();

  const room = max - urls.length;

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (room <= 0) {
      setError(`That is the maximum of ${max} images. Remove one first.`);
      return;
    }

    const uploaded = await upload(files.slice(0, room));
    if (uploaded.length > 0) setUrls((current) => [...current, ...uploaded]);
  };

  const move = (index: number, delta: number) => {
    setUrls((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-medium uppercase tracking-[0.12em] text-content-muted">
        {label}
      </span>

      {/* One field, newline-separated — the shape the server already parses. */}
      <input type="hidden" name={name} value={urls.join("\n")} />

      {urls.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {urls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="flex w-24 flex-col gap-1 border border-line p-1.5"
            >
              <div className="relative aspect-4/5 w-full overflow-hidden bg-surface-sunken">
                <Thumb url={url} sizes="96px" />
              </div>

              <span className="truncate text-center text-[10px] uppercase tracking-[0.1em] text-content-subtle">
                {slotLabels?.[index] ?? `Image ${index + 1}`}
              </span>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move image ${index + 1} earlier`}
                  className="grid size-6 place-items-center text-content-muted hover:text-content disabled:opacity-30"
                >
                  <ArrowLeft size={12} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUrls((current) => current.filter((_, i) => i !== index));
                    setError(null);
                  }}
                  aria-label={`Remove image ${index + 1}`}
                  className="grid size-6 place-items-center text-danger-500 hover:opacity-70"
                >
                  <Trash size={12} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === urls.length - 1}
                  aria-label={`Move image ${index + 1} later`}
                  className="grid size-6 place-items-center text-content-muted hover:text-content disabled:opacity-30"
                >
                  <ArrowRight size={12} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {room > 0 ? (
        <DropZone
          label={
            urls.length === 0
              ? "Drop images here, or click to choose"
              : `Add another (${room} left)`
          }
          hint={hint ?? `Up to ${max}, in order · ${MAX_UPLOAD_LABEL} each`}
          multiple
          busy={busy}
          over={over}
          onFiles={onFiles}
          dragHandlers={handlers}
        />
      ) : (
        <p className="flex items-center gap-1.5 text-2xs text-content-muted">
          <ImageIcon size={13} aria-hidden />
          {max} of {max} images added. Remove one to replace it.
        </p>
      )}

      <ErrorNote message={error} />
    </div>
  );
}
