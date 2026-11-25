import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isSafeHref, renderInline } from "../policy-text";

const html = (text: string) => renderToStaticMarkup(createElement("p", null, ...renderInline(text)));

describe("renderInline", () => {
  it("leaves plain text alone", () => {
    expect(html("Nothing special here.")).toBe("<p>Nothing special here.</p>");
  });

  it("makes bold", () => {
    expect(html("a **b** c")).toBe("<p>a <strong>b</strong> c</p>");
  });

  it("makes links to site paths, email and https", () => {
    expect(html("[Contact](/contact)")).toContain('href="/contact"');
    expect(html("[Write](mailto:returns@kabuda.in)")).toContain('href="mailto:returns@kabuda.in"');
    expect(html("[Site](https://kabuda.in)")).toContain('href="https://kabuda.in"');
  });

  it("shows the label of a link it will not follow, instead of a dangerous link", () => {
    const out = html("[click](javascript:alert(1))");

    expect(out).not.toContain("href");
    expect(out).not.toContain("javascript");
  });

  it("does not turn markup in the text into markup", () => {
    const out = html("<img src=x onerror=alert(1)> and <script>x</script>");

    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img");
  });

  it("shows nothing for a link whose label is empty, as an unfilled token leaves it", () => {
    expect(html("Email: [](mailto:)")).toBe("<p>Email: </p>");
  });

  it("handles several in a row", () => {
    const out = html("**One** then [two](/two) then three");

    expect(out).toContain("<strong>One</strong>");
    expect(out).toContain('href="/two"');
    expect(out.endsWith("then three</p>")).toBe(true);
  });
});

describe("isSafeHref", () => {
  it.each(["/privacy", "/a/b?x=1#y", "mailto:a@b.in", "https://kabuda.in/x"])("allows %s", (href) => {
    expect(isSafeHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "//evil.example.com",
    "http://insecure.example.com",
    "data:text/html,x",
    "vbscript:x",
    "",
    "relative/path",
    "mailto:",
  ])("refuses %j", (href) => {
    expect(isSafeHref(href)).toBe(false);
  });
});