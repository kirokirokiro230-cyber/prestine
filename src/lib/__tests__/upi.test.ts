import { describe, expect, it } from "vitest";
import { maskUpiId, normaliseUpiId, upiError } from "../upi";

describe("normaliseUpiId", () => {
  it("trims and lower-cases, since handles are not case sensitive", () => {
    expect(normaliseUpiId("  Asha.K@OKAXIS ")).toBe("asha.k@okaxis");
  });
});

describe("upiError", () => {
  it.each([
    "asha@okaxis",
    "asha.kapoor@oksbi",
    "asha_k-99@ybl",
    "9876543210@ybl",
    "9876543210@paytm",
    "a1@ibl",
    "Asha@OkAxis",
    "  asha@okaxis  ",
  ])("accepts %s", (value) => {
    expect(upiError(value)).toBeNull();
  });

  it("asks for an ID when it is empty or only spaces", () => {
    expect(upiError("")).toMatch(/enter your upi id/i);
    expect(upiError("   ")).toMatch(/enter your upi id/i);
  });

  it("explains the shape when the @ is missing", () => {
    expect(upiError("ashaokaxis")).toMatch(/name@bank/i);
    expect(upiError("9876543210")).toMatch(/name@bank/i);
  });

  it.each([
    ["no name", "@okaxis"],
    ["no handle", "asha@"],
    ["a one-letter name", "a@okaxis"],
    ["a space inside", "as ha@okaxis"],
    ["two @ signs", "asha@ok@axis"],
    ["a dot in the handle", "asha@ok.axis"],
    ["a leading dot in the name", ".asha@okaxis"],
    ["a one-letter handle", "asha@o"],
    ["a handle starting with a digit", "asha@9bank"],
    ["an email address", "asha@gmail.com"],
  ])("rejects %s", (_label, value) => {
    expect(upiError(value)).not.toBeNull();
  });

  /*
   * The ID is stored, shown to staff and put in a copy button. It must not be able to
   * carry markup, a script, a URL or a payment-link parameter into any of those.
   */
  it.each([
    "<script>alert(1)</script>@ybl",
    "asha<b>@ybl",
    "asha@ybl<script>",
    "javascript:alert(1)@ybl",
    "upi://pay?pa=evil@ybl&am=100",
    "asha@ybl?am=100",
    "asha@ybl&pn=x",
    "asha@ybl#x",
    "asha@ybl\nbcc:evil@x.com",
    "asha@ybl\u0000",
    "'; drop table returns;--@ybl",
    "https://evil.example/@ybl",
    "asha%40ybl",
    "asha@ybl;x",
  ])("refuses %j", (value) => {
    expect(upiError(value)).not.toBeNull();
  });

  it("refuses an absurdly long ID", () => {
    expect(upiError(`${"a".repeat(200)}@ybl`)).not.toBeNull();
  });

  it("is not fooled by full-width or look-alike characters", () => {
    expect(upiError("ａｓｈａ@ybl")).not.toBeNull();
    expect(upiError("asha@ｙｂｌ")).not.toBeNull();
    // Cyrillic "а" in place of Latin "a".
    expect(upiError("\u0430sha@ybl")).not.toBeNull();
  });
});

describe("maskUpiId", () => {
  it("keeps two characters of the name and the whole handle", () => {
    expect(maskUpiId("ashakapoor@okaxis")).toBe("as••••@okaxis");
  });

  it("keeps only one character of a short name", () => {
    expect(maskUpiId("abc@ybl")).toBe("a••••@ybl");
  });

  /*
   * A phone-number ID is ten digits. A mask that showed one dot per character would
   * reveal that, which is most of what an observer needs to guess the rest.
   */
  it("hides the real length of the name", () => {
    // Names of very different length mask to exactly the same thing.
    expect(maskUpiId("asha@ybl")).toBe("as••••@ybl");
    expect(maskUpiId("ashakapoorsharma99@ybl")).toBe("as••••@ybl");
    expect(maskUpiId("9876543210@ybl")).toBe("98••••@ybl");
    expect(maskUpiId("9876543210@ybl")).toHaveLength(maskUpiId("9876@ybl").length);
  });

  it("normalises before masking", () => {
    expect(maskUpiId("  AshaKapoor@OKAXIS ")).toBe("as••••@okaxis");
  });

  it("never reveals the name's tail", () => {
    const masked = maskUpiId("ashakapoor@okaxis");

    expect(masked).not.toContain("kapoor");
    expect(masked).not.toContain("shak");
  });

  it("returns a bare mask for something with no @", () => {
    expect(maskUpiId("notanid")).toBe("••••");
    expect(maskUpiId("@ybl")).toBe("••••");
  });
});
