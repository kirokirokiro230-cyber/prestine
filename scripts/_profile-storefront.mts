import "./env.ts";

process.on("unhandledRejection", (error) => {
  console.error("UNHANDLED REJECTION", error);
});

const { getSettings, listPromoCodes } = await import("../src/server/repositories/settings.ts");
const { listCategories, listCollections } = await import("../src/server/repositories/taxonomy.ts");
const { listActiveProducts } = await import("../src/server/repositories/products.ts");
const { listLiveBanners } = await import("../src/server/repositories/banners.ts");

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  console.log(`${label}: start`);
  try {
    const result = await fn();
    console.log(`${label}: ok ${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (error) {
    console.error(`${label}: FAILED ${Math.round(performance.now() - start)}ms`, error);
    throw error;
  }
}

console.log("warmup");
await timed("warmup settings", getSettings);

console.log("parallel home-shaped reads");
const calls = [
  timed("settings-1", getSettings),
  timed("settings-2", getSettings),
  timed("categories", listCategories),
  timed("collections", listCollections),
  timed("products-1", listActiveProducts),
  timed("products-2", listActiveProducts),
  timed("products-3", listActiveProducts),
  timed("banners", listLiveBanners),
  timed("promos", listPromoCodes),
];

const results = await Promise.allSettled(calls);
console.log("settled", results.map((r) => r.status));
await new Promise((resolve) => setTimeout(resolve, 2000));
process.exit(results.some((r) => r.status === "rejected") ? 1 : 0);
