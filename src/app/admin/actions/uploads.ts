"use server";

import { recordAudit } from "@/server/audit";
import { PermissionError, requirePermission } from "@/server/session";
import { saveImage } from "@/server/uploads";

/**
 * Image upload.
 *
 * Called on drop rather than on form submit, so the merchant sees the picture appear
 * immediately and the form only ever carries the resulting URL. That keeps the product
 * and banner forms as plain field submissions — no multipart handling, no partial saves
 * where the image landed but the record did not.
 *
 * Gated on `products:write`: uploading is merchandising, the same permission that lets
 * someone edit the product the image belongs to. It is deliberately not tied to
 * `settings:write`, or a manager could not add photography without also being able to
 * change the tax rate.
 */

export interface UploadState {
  url?: string;
  error?: string;
}

export async function uploadImageAction(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  try {
    const admin = await requirePermission("products:write");

    const file = formData.get("file");

    // Not a `File` at all — an empty picker, or a hand-made request.
    if (!(file instanceof File)) return { error: "No file was received." };

    const result = await saveImage(file);
    if (!result.ok) return { error: result.error };

    /**
     * Logged because it writes to disk on the server's behalf. If the uploads
     * directory ever fills up, the audit trail is what says who put what there — and
     * the size is recorded since that is the number that matters when it does.
     */
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "create",
      entity: "upload",
      entityId: result.url,
      summary: `Uploaded ${(result.bytes / 1024).toFixed(0)}KB ${result.type}`,
    });

    return { url: result.url };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message };

    // Most likely a read-only filesystem, which is the expected failure on Vercel or
    // Netlify. Say so plainly rather than surfacing `EROFS`.
    const message = (error as Error).message;
    if (/EROFS|EACCES|read-only/i.test(message)) {
      return {
        error:
          "The server cannot write files. Uploads need a persistent disk or object storage — see src/server/uploads.ts.",
      };
    }

    return { error: message };
  }
}


