"use client";

import { useActionState, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  X,
} from "@phosphor-icons/react";
import {
  deleteBannerAction,
  moveBannerAction,
  saveBannerAction,
  toggleBannerAction,
  type BannerActionState,
} from "@/app/admin/actions/banners";
import { ImageUploadField } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField, TextArea, TextField } from "@/components/ui/field";
import { BANNER_STATE_LABEL, type BannerState } from "@/lib/banners";
import type { Banner } from "@/lib/types";
import { ConfirmSubmit, FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Home-page banner manager.
 *
 * Ordering uses two arrow buttons rather than drag-and-drop: it is keyboard
 * accessible with no extra work, it survives on touch, and for a handful of slides
 * it is faster anyway.
 *
 * Each row shows a live-accurate state — published, scheduled, expired or hidden —
 * because "active" alone is misleading once dates are involved. A merchant needs to
 * know at a glance whether a slide is actually on the site right now.
 */

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO instant. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const STATE_STYLE: Record<BannerState, string> = {
  live: "bg-success-100 text-success-700 dark:bg-success-700/25 dark:text-success-100",
  scheduled: "bg-warning-100 text-warning-700 dark:bg-warning-700/25 dark:text-warning-100",
  expired: "bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-100",
  hidden: "bg-surface-sunken text-content-muted",
};

/**
 * @param states Each banner's live state, keyed by id.
 *
 * Passed in rather than computed here: reading the clock during render is impure and
 * would make the server and client disagree. The admin page is dynamic, so it always
 * has a fresh answer.
 */
export function BannerManager({
  banners,
  states,
}: {
  banners: Banner[];
  states: Record<string, BannerState>;
}) {
  const [state, action] = useActionState<BannerActionState, FormData>(saveBannerAction, {});

  /** `null` = closed, `""` = creating, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing ? banners.find((banner) => banner.id === editing) : undefined;

  const liveCount = banners.filter((banner) => states[banner.id] === "live").length;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr] xl:items-start">
      <Panel
        title="Banners"
        description={
          banners.length === 0
            ? "No slides yet."
            : `${banners.length} slide${banners.length === 1 ? "" : "s"}, ${liveCount} showing on the home page.`
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(editing === "" ? null : "")}
          >
            <Plus size={13} aria-hidden />
            New banner
          </Button>
        }
        bodyClassName="px-0 py-0"
      >
        {banners.length === 0 ? (
          <p className="px-5 py-6 text-sm text-content-muted">
            The home page hero is empty. Add a slide to fill it.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {banners.map((banner, index) => {
              const status = states[banner.id] ?? "hidden";

              return (
                <li key={banner.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  {/* Colour or image preview, so slides are identifiable at a glance. */}
                  <span
                    aria-hidden
                    className="mt-0.5 h-12 w-16 shrink-0 rounded-xs border border-line bg-cover bg-center"
                    style={
                      banner.imageUrl
                        ? { backgroundImage: `url(${banner.imageUrl})` }
                        : {
                            backgroundImage: `linear-gradient(135deg, ${
                              banner.accentHex ?? "#3A3A38"
                            }, ${banner.accentHex ?? "#3A3A38"}55)`,
                          }
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-numeric
                        className="text-2xs text-content-subtle"
                      >
                        {index + 1}
                      </span>
                      <h3 className="text-sm font-medium">{banner.heading}</h3>
                      <span
                        className={`px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] ${STATE_STYLE[status]}`}
                      >
                        {BANNER_STATE_LABEL[status]}
                      </span>
                    </div>

                    {banner.eyebrow ? (
                      <p className="mt-1 text-2xs uppercase tracking-[0.12em] text-content-subtle">
                        {banner.eyebrow}
                      </p>
                    ) : null}

                    {banner.ctaLabel ? (
                      <p className="mt-1.5 text-xs text-content-muted">
                        {banner.ctaLabel} →{" "}
                        <span data-numeric className="font-mono text-2xs">
                          {banner.ctaHref}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-content-subtle">No call to action</p>
                    )}

                    {banner.startsAt || banner.endsAt ? (
                      <p className="mt-1.5 text-2xs text-content-subtle">
                        {banner.startsAt ? `From ${toLocalInput(banner.startsAt)}` : "No start"}
                        {" · "}
                        {banner.endsAt ? `until ${toLocalInput(banner.endsAt)}` : "no end"}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <form action={moveBannerAction}>
                      <input type="hidden" name="id" value={banner.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        aria-label={`Move “${banner.heading}” earlier`}
                        title="Move up"
                        className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowUp size={14} aria-hidden />
                      </button>
                    </form>

                    <form action={moveBannerAction}>
                      <input type="hidden" name="id" value={banner.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={index === banners.length - 1}
                        aria-label={`Move “${banner.heading}” later`}
                        title="Move down"
                        className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowDown size={14} aria-hidden />
                      </button>
                    </form>

                    <form action={toggleBannerAction}>
                      <input type="hidden" name="id" value={banner.id} />
                      <input type="hidden" name="active" value={banner.active ? "0" : "1"} />
                      <button
                        type="submit"
                        aria-label={
                          banner.active
                            ? `Hide “${banner.heading}”`
                            : `Publish “${banner.heading}”`
                        }
                        title={banner.active ? "Hide" : "Publish"}
                        className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                      >
                        {banner.active ? (
                          <Eye size={14} aria-hidden />
                        ) : (
                          <EyeSlash size={14} aria-hidden />
                        )}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={() => setEditing(editing === banner.id ? null : banner.id)}
                      aria-label={`Edit “${banner.heading}”`}
                      title="Edit"
                      className="grid size-9 place-items-center text-content-muted transition-colors hover:text-content"
                    >
                      <PencilSimple size={14} aria-hidden />
                    </button>

                    <form action={deleteBannerAction}>
                      <input type="hidden" name="id" value={banner.id} />
                      <ConfirmSubmit confirmLabel="Confirm delete">Delete</ConfirmSubmit>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      {editing !== null ? (
        <Panel
          title={current ? "Edit banner" : "New banner"}
          action={
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close editor"
              className="grid size-8 place-items-center text-content-muted transition-colors hover:text-content"
            >
              <X size={15} aria-hidden />
            </button>
          }
        >
          <FormFeedback error={state.error} success={state.success} />

          {/* Keyed so switching slides resets the uncontrolled inputs. */}
          <form key={editing} action={action} className="mt-2 flex flex-col gap-5">
            <input type="hidden" name="id" value={current?.id ?? ""} />

            <TextField
              label="Eyebrow"
              name="eyebrow"
              defaultValue={current?.eyebrow}
              hint="Small label above the heading. Optional."
            />

            <TextField
              label="Heading"
              name="heading"
              defaultValue={current?.heading}
              hint="Keep it to one line. This is the largest text on the page."
              required
            />

            <TextArea
              label="Body"
              name="body"
              rows={3}
              defaultValue={current?.body}
              hint="One or two sentences. Optional."
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Button label"
                name="ctaLabel"
                defaultValue={current?.ctaLabel}
              />
              <TextField
                label="Button link"
                name="ctaHref"
                defaultValue={current?.ctaHref}
                hint="/collections/sale or https://…"
              />
            </div>

            {/*
              Three crops, because the hero is a different shape at each width — a wide
              cinematic band on a laptop, a tall block on a phone. One file forced into
              both has to have its sides discarded, which is what makes a banner look cut.

              Only desktop is really needed; the other two fall back to it. The pixel
              guidance matters more than usual here: these are served straight from
              storage rather than through the image optimiser, so an oversized upload is
              an oversized download on the slowest connection you have.
            */}
            <ImageUploadField
              name="imageUrl"
              label="Banner image — desktop"
              defaultValue={current?.imageUrl}
              hint="Recommended 2560 × 800 (about 3.2:1). Optional — a gradient from the accent colour is used instead."
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <ImageUploadField
                name="imageUrlTablet"
                label="Tablet crop"
                defaultValue={current?.imageUrlTablet}
                hint="Optional. Recommended 1536 × 800. Falls back to the desktop image."
              />
              <ImageUploadField
                name="imageUrlMobile"
                label="Mobile crop"
                defaultValue={current?.imageUrlMobile}
                hint="Optional. Recommended 900 × 1200 (portrait). Falls back to the tablet, then desktop."
              />
            </div>

            <TextField
              label="Image description"
              name="imageAlt"
              defaultValue={current?.imageAlt}
              hint="What the photo shows, for screen readers. Leave blank if it is purely decorative."
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Accent colour"
                name="accentHex"
                defaultValue={current?.accentHex ?? "#3A3A38"}
                hint="Six-digit hex. Used for the gradient when there is no image."
              />
              <SelectField
                label="Text colour"
                name="textTone"
                defaultValue={current?.textTone ?? "light"}
                options={[
                  { value: "light", label: "Light text (dark image)" },
                  { value: "dark", label: "Dark text (light image)" },
                ]}
                hint="Pick whichever keeps the copy readable."
              />
            </div>

            <SelectField
              label="Text position"
              name="align"
              defaultValue={current?.align ?? "left"}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Centred" },
              ]}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Show from"
                name="startsAt"
                type="datetime-local"
                defaultValue={toLocalInput(current?.startsAt)}
                hint="Optional. Leave blank to start immediately."
              />
              <TextField
                label="Show until"
                name="endsAt"
                type="datetime-local"
                defaultValue={toLocalInput(current?.endsAt)}
                hint="Optional. Leave blank to run indefinitely."
              />
            </div>

            <Checkbox
              label="Published"
              name="active"
              hint="Unpublished slides stay here but never appear on the home page."
              defaultChecked={current?.active ?? true}
            />

            <div className="flex items-center gap-3">
              <SubmitButton>{current ? "Save changes" : "Create banner"}</SubmitButton>
              <Button type="button" variant="ghost" size="md" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel title="About the hero">
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-content-muted">
            <p>
              Slides run in the order below and advance automatically every few seconds.
              One slide renders as a static banner with no controls.
            </p>
            <p>
              Visitors who have asked their device to reduce motion never see it move —
              they get the first slide, held still. That is deliberate, not a bug.
            </p>
            <p>
              With no image URL a slide draws a gradient from its accent colour, so the
              hero never shows a broken image while you are still shooting photography.
            </p>
          </div>
          <Button variant="outline" size="md" className="mt-5" onClick={() => setEditing("")}>
            <Plus size={13} aria-hidden />
            New banner
          </Button>
        </Panel>
      )}
    </div>
  );
}
