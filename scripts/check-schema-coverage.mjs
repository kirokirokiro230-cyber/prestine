/**
 * Cross-checks the database schema against the domain model.
 *
 * `src/lib/types.ts` is the contract the whole app is written against; the schema is how
 * it gets persisted. If a field exists in one and not the other, nothing fails to
 * compile — the repositories simply drop it on write or return `undefined` on read, and
 * the bug shows up much later as a setting that will not save or an order detail that
 * vanished. This compares the two directly.
 *
 * Deliberately a text comparison rather than importing either module: the schema pulls in
 * `postgres`, which would need a live connection just to list column names.
 *
 * Usage: node scripts/check-schema-coverage.mjs
 */
import { readFileSync } from "node:fs";

const types = readFileSync("src/lib/types.ts", "utf8");
const schema = readFileSync("src/server/db/schema.ts", "utf8");

let failures = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

/** Field names declared on a TypeScript interface. */
function interfaceFields(name) {
  const match = types.match(
    new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) return null;

  return [...match[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((entry) => entry[1]);
}

/**
 * Column property names declared on a Drizzle table.
 *
 * Tables are written two ways — `pgTable("x", { ... })` and the three-argument form with
 * a trailing index callback — and the two indent their columns differently. Matching the
 * closing brace by pattern silently ran past the end of the shorter form and reported
 * another table's columns, so the object is located by balancing braces instead.
 */
function tableColumns(name) {
  const start = schema.search(new RegExp(`export const ${name} = pgTable\\(`));
  if (start === -1) return null;

  const open = schema.indexOf("{", start);
  if (open === -1) return null;

  let depth = 0;
  let close = -1;

  for (let i = open; i < schema.length; i += 1) {
    if (schema[i] === "{") depth += 1;
    else if (schema[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return null;

  const body = schema.slice(open + 1, close);

  /**
   * Only top-level properties. Nested generics such as `jsonb().$type<{ a: string }>()`
   * contain their own `key:` pairs, which are not columns — tracking depth excludes them.
   */
  const columns = [];
  let nesting = 0;

  for (const line of body.split("\n")) {
    const property = nesting === 0 ? line.match(/^\s+(\w+):\s*\w/) : null;
    if (property) columns.push(property[1]);

    for (const character of line) {
      if (character === "{" || character === "<" || character === "(") nesting += 1;
      else if (character === "}" || character === ">" || character === ")") nesting -= 1;
    }
    if (nesting < 0) nesting = 0;
  }

  return columns;
}

/**
 * Compare one interface with one table.
 *
 * `skipInType` lists fields the schema deliberately does not store as columns — child
 * tables, or values kept as jsonb under a different name. `extraInTable` lists columns
 * with no counterpart in the domain type, which are legitimate when the repository
 * derives the domain field from them.
 */
function compare(label, fields, columns, { skipInType = [], extraInTable = [] } = {}) {
  if (!fields) {
    check(`${label}: interface found`, false);
    return;
  }
  if (!columns) {
    check(`${label}: table found`, false);
    return;
  }

  const missing = fields.filter(
    (field) => !columns.includes(field) && !skipInType.includes(field),
  );
  const extra = columns.filter(
    (column) => !fields.includes(column) && !extraInTable.includes(column),
  );

  check(
    `${label}: every field is persisted`,
    missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : `${fields.length} fields`,
  );
  check(
    `${label}: no orphan columns`,
    extra.length === 0,
    extra.length ? `unexplained: ${extra.join(", ")}` : `${columns.length} columns`,
  );
}

console.log("— every persisted collection has a table —");
/**
 * `StoreData` is the full list of what the JSON store held, so it is the checklist. Any
 * key without a table is data that would be silently lost in the migration.
 */
const storeData = types.match(/export interface StoreData \{([\s\S]*?)\n\}/)?.[1] ?? "";
const collections = [...storeData.matchAll(/^\s{2}(\w+)\??:/gm)].map((entry) => entry[1]);

const TABLE_FOR = {
  // `version` was the JSON document's own schema version. Drizzle's migration history
  // replaces it, so there is deliberately no column for it.
  version: null,
  products: "products",
  categories: "categories",
  collections: "collections",
  banners: "banners",
  promoCodes: "promoCodes",
  settings: "settings",
  orders: "orders",
  admins: "admins",
  customers: "customers",
  phoneVerifications: "phoneVerifications",
  hiddenReviewIds: "hiddenReviews",
  submittedReviews: "submittedReviews",
  emailTemplates: "emailTemplates",
  emailLog: "emailLog",
  audit: "auditLog",
};

for (const key of collections) {
  if (!(key in TABLE_FOR)) {
    check(`${key} is accounted for`, false, "no table mapping declared");
    continue;
  }
  const table = TABLE_FOR[key];
  if (table === null) {
    console.log(`pass  ${key} needs no table  — replaced by migration history`);
    continue;
  }
  check(`${key} → ${table}`, schema.includes(`export const ${table} = pgTable`));
}

console.log("\n— child tables for the nested arrays —");
for (const table of ["productColors", "productSizes", "productCollections", "orderLines"]) {
  check(table, schema.includes(`export const ${table} = pgTable`));
}
// Rate limiting was in memory, which does not survive serverless. See the schema.
check("loginAttempts", schema.includes("export const loginAttempts = pgTable"));

console.log("\n— field-level coverage —");

compare("Product", interfaceFields("Product"), tableColumns("products"), {
  // Child tables, not columns.
  skipInType: ["colors", "sizes", "collections"],
});

compare("ProductColor", interfaceFields("ProductColor"), tableColumns("productColors"), {
  // `id` is the colourway slug; the column is `colorId` because `productId` is also
  // part of the composite key.
  skipInType: ["id"],
  extraInTable: ["productId", "colorId", "position"],
});

compare("ProductSize", interfaceFields("ProductSize"), tableColumns("productSizes"), {
  extraInTable: ["productId", "position"],
});

compare("Order", interfaceFields("Order"), tableColumns("orders"), {
  skipInType: ["lines"],
});

compare("OrderLine", interfaceFields("OrderLine"), tableColumns("orderLines"), {
  extraInTable: ["orderId", "position"],
});

compare("Category", interfaceFields("Category"), tableColumns("categories"));
compare("Collection", interfaceFields("Collection"), tableColumns("collections"));
compare("Banner", interfaceFields("Banner"), tableColumns("banners"));

compare("PromoCode", interfaceFields("PromoCode"), tableColumns("promoCodes"), {
  // Recorded when an order uses the code; not part of the storefront-facing type.
  extraInTable: ["usageCount"],
});

// `ShippingMethod` was compared here. The shop has one shipping arrangement, so the
// interface and its table were both removed — delivery is settings fields now.

compare("StoreSettings", interfaceFields("StoreSettings"), tableColumns("settings"), {
  extraInTable: ["id"],
});

compare("AdminUser", interfaceFields("AdminUser"), tableColumns("admins"));
compare("AuditEntry", interfaceFields("AuditEntry"), tableColumns("auditLog"));

compare("CustomerAccount", interfaceFields("CustomerAccount"), tableColumns("customers"));
compare(
  "PhoneVerification",
  interfaceFields("PhoneVerification"),
  tableColumns("phoneVerifications"),
);

compare("EmailTemplate", interfaceFields("EmailTemplate"), tableColumns("emailTemplates"));
compare("EmailRecord", interfaceFields("EmailRecord"), tableColumns("emailLog"));

compare(
  "SubmittedReview",
  interfaceFields("SubmittedReview"),
  tableColumns("submittedReviews"),
);

console.log("\n— snapshots are stored whole, not flattened —");
// An order's totals and address must record what was agreed, not what today's settings
// would produce, so they are jsonb rather than columns that could drift.
check("order totals as jsonb", /totals: jsonb\("totals"\)/.test(schema));
check("shipping address as jsonb", /shippingAddress: jsonb\("shipping_address"\)/.test(schema));
check("order notes as jsonb", /notes: jsonb\("notes"\)/.test(schema));
check("settings social links as jsonb", /social: jsonb\("social"\)/.test(schema));

console.log("\n— no inventory anywhere —");
check("no stock column", !/stock/i.test(schema.replace(/\/\*[\s\S]*?\*\//g, "")));

console.log("\n— constraints that matter —");
check("product slug is unique", schema.includes("products_slug_key"));
check("admin email is unique", schema.includes("admins_email_key"));
// The number is the credential. A duplicate makes sign-in ambiguous, and the person who
// loses that ambiguity is a real customer whose orders hang off the other row.
check("customer phone is unique", schema.includes("customers_phone_key"));
check("settings is limited to one row", schema.includes("settings_single_row"));
check("order lines cascade with the order", /orderId[\s\S]{0,200}onDelete: "cascade"/.test(schema));

console.log(
  `\n${failures === 0 ? "SCHEMA COVERAGE COMPLETE" : `${failures} GAP(S) FOUND`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
