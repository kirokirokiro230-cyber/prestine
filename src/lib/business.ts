/**
 * Who the business is, for the policy pages.
 *
 * Most of this is NOT here. The legal name, support email, phone and address are the store's
 * settings (Admin → Settings), so there is one place to change them and the footer, the
 * contact page, the emails and the policies all agree. This file holds only what the settings
 * have no field for.
 *
 * ## The Grievance Officer
 *
 * Indian consumer-protection rules for online sellers expect a named Grievance Officer with
 * contact details, published on the site. The fields below are left empty because they have
 * not been provided, and the policy page leaves a line out when its value is empty rather
 * than printing a placeholder at customers. Fill them in here. Until the name and contact
 * number are set, that part of the Grievance Redressal Policy is incomplete.
 */

/** The official website, as it appears in the contact details. */
export const WEBSITE = "https://kabuda.in";

/** Where return and exchange requests are emailed. */
export const RETURNS_EMAIL = "returns@kabuda.in";

export const grievanceOfficer = {
  /** The appointed officer's name. */
  name: "",
  designation: "Grievance Officer",
  /** Falls back to the support email when empty. */
  email: "",
  /** The officer's contact number. */
  phone: "",
  /** Falls back to the business address when empty. */
  address: "",
} as const;
