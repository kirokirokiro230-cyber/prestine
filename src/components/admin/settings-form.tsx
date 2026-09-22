"use client";

import { useActionState } from "react";
import {
  saveSettingsAction,
  type SettingsActionState,
} from "@/app/admin/actions/settings";
import { Checkbox, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { StoreSettings } from "@/lib/types";
import { FormFeedback, Panel, SubmitButton } from "./primitives";

/**
 * Store settings.
 *
 * Two independent forms so saving a shipping rate does not require re-submitting
 * the whole store identity, and a validation error in one does not discard the other.
 *
 * The tax rate is stored as a fraction but entered as a percentage — people think in
 * percentages, and the conversion belongs at the edge.
 */

const CURRENCIES = ["USD", "GBP", "EUR", "INR", "CAD", "AUD", "JPY", "AED"];
const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
];

export function SettingsForm({ settings }: { settings: StoreSettings }) {
  const [state, action] = useActionState<SettingsActionState, FormData>(
    saveSettingsAction,
    {},
  );

  const major = (minor: number) => (minor / 100).toFixed(2);

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        <FormFeedback error={state.error} success={state.success} />

        <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
          <Panel title="Store identity" description="Used across the storefront and in metadata.">
            <div className="flex flex-col gap-5">
              <TextField label="Store name" name="name" defaultValue={settings.name} required />
              <TextField
                label="Legal name"
                name="legalName"
                defaultValue={settings.legalName}
                hint="Appears in the footer copyright and terms."
              />
              <TextField label="Tagline" name="tagline" defaultValue={settings.tagline} />
              <TextArea
                label="Description"
                name="description"
                rows={4}
                defaultValue={settings.description}
                hint="Default meta description and footer blurb."
              />
              <TextField
                label="Public URL"
                name="url"
                defaultValue={settings.url}
                error={state.fieldErrors?.url}
                hint="Drives canonical URLs, the sitemap and Open Graph tags. Set this to your real domain before launch."
                required
              />
            </div>
          </Panel>

          <Panel title="Contact" description="Shown on the contact page and in the footer.">
            <div className="flex flex-col gap-5">
              <TextField label="Email" name="email" type="email" defaultValue={settings.email} />
              <TextField label="Phone" name="phone" defaultValue={settings.phone} />
              <TextField label="Address" name="address" defaultValue={settings.address} />

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Instagram" name="instagram" defaultValue={settings.social.instagram} />
                <TextField label="Pinterest" name="pinterest" defaultValue={settings.social.pinterest} />
                <TextField label="YouTube" name="youtube" defaultValue={settings.social.youtube} />
              </div>
            </div>
          </Panel>

          <Panel
            title="Commerce"
            description="These feed the cart and checkout maths directly."
          >
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Currency"
                  name="currency"
                  defaultValue={settings.currency}
                  options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                  hint="Changes how every price is formatted."
                />
                <SelectField
                  label="Locale"
                  name="locale"
                  defaultValue={settings.locale}
                  options={LOCALES}
                  hint="Number, date and currency formatting."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={`Free shipping over (${settings.currency})`}
                  name="freeShippingThreshold"
                  inputMode="decimal"
                  defaultValue={major(settings.freeShippingThreshold)}
                  error={state.fieldErrors?.freeShippingThreshold}
                  required
                />
                <TextField
                  label={`Standard shipping rate (${settings.currency})`}
                  name="standardShippingRate"
                  inputMode="decimal"
                  defaultValue={major(settings.standardShippingRate)}
                  error={state.fieldErrors?.standardShippingRate}
                  hint="Charged below the threshold."
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Tax rate (%)"
                  name="taxRate"
                  inputMode="decimal"
                  defaultValue={(settings.taxRate * 100).toFixed(2)}
                  error={state.fieldErrors?.taxRate}
                  required
                />
                <TextField
                  label="Return window (days)"
                  name="returnWindowDays"
                  type="number"
                  min={0}
                  defaultValue={String(settings.returnWindowDays)}
                  error={state.fieldErrors?.returnWindowDays}
                  required
                />
              </div>

              {/*
                One shipping option, so this is the delivery promise the whole site
                makes — the product page pincode check, the cart, checkout and the
                shipping page all read it. Not fetched from the courier: Delhivery's
                serviceability API reports whether a pincode is served, not how long it
                takes.
              */}
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Delivery from (business days)"
                  name="deliveryDaysMin"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={String(settings.deliveryDaysMin)}
                  error={state.fieldErrors?.deliveryDaysMin}
                  required
                />
                <TextField
                  label="Delivery to (business days)"
                  name="deliveryDaysMax"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={String(settings.deliveryDaysMax)}
                  error={state.fieldErrors?.deliveryDaysMax}
                  hint="Shown as a range, e.g. “3–5 business days”."
                  required
                />
              </div>

              <TextField
                label="Review request delay (days after delivery)"
                name="reviewRequestDelayDays"
                type="number"
                min={0}
                max={90}
                defaultValue={String(settings.reviewRequestDelayDays)}
                error={state.fieldErrors?.reviewRequestDelayDays}
                hint="How long to wait before asking for a review. Zero asks the moment an order is marked delivered, which is usually before anyone has opened the parcel. Manage the email itself under Email."
                required
              />
            </div>
          </Panel>

          <Panel title="Storefront" description="Announcement bar and availability.">
            <div className="flex flex-col gap-5">
              <TextArea
                label="Announcement messages"
                name="announcements"
                rows={4}
                defaultValue={settings.announcements.join("\n")}
                hint="One per line. The first shows on mobile; the rest appear as the viewport widens."
              />

              <Checkbox
                label="Maintenance mode"
                name="maintenanceMode"
                hint="Replaces the storefront with a holding page. Admin stays reachable."
                defaultChecked={settings.maintenanceMode}
              />
            </div>
          </Panel>

          <Panel
            title="Home page"
            description="The scrolling strip under the hero, and how much of the catalogue the page shows."
          >
            <div className="flex flex-col gap-5">
              <TextArea
                label="Scrolling strip"
                name="marqueeItems"
                rows={6}
                defaultValue={settings.marqueeItems.join("\n")}
                hint="One phrase per line. Shown in the marquee that scrolls under the hero."
              />

              <TextField
                label="New arrivals shown"
                name="homeNewArrivalsCount"
                type="number"
                min={1}
                max={24}
                defaultValue={String(settings.homeNewArrivalsCount)}
                error={state.fieldErrors?.homeNewArrivalsCount}
                hint="Products tick “Show on the home page” to appear here. Any beyond this count are reachable with the arrows."
              />
            </div>
          </Panel>

          <Panel
            title="Service promises"
            description="Shown in the footer and on every product page. Change them once and they change everywhere."
          >
            <div className="flex flex-col gap-5">
              <TextArea
                label="Promises"
                name="servicePromises"
                rows={5}
                defaultValue={settings.servicePromises
                  .map((promise) => `${promise.title} | ${promise.body}`)
                  .join("\n")}
                hint="One per line, as “Title | Description”. Three fits the layout best."
              />

              <TextArea
                label="Shipping and returns"
                name="shippingReturnsCopy"
                rows={6}
                defaultValue={settings.shippingReturnsCopy.join("\n")}
                hint="One paragraph per line. Fills the “Shipping & returns” tab on the product page."
              />
            </div>
          </Panel>
        </div>

        <div>
          <SubmitButton size="lg">Save settings</SubmitButton>
        </div>
      </form>

    </div>
  );
}
