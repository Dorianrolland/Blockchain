console.warn(
  "scripts/deploy-v2.ts is deprecated on this branch. Running the canonical upgraded deployment pipeline from scripts/deploy.ts instead.",
);

await import("./deploy.ts");
