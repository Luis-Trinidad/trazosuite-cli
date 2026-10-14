import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: true,
  platform: "node",
  exports: true,
  // El paquete de npm se publica autocontenido: api-client y commander van
  // dentro de dist/cli.mjs, sin dependencias de runtime (tsdown externaliza
  // las dependencies por defecto; esto las fuerza al bundle).
  noExternal: ["@trazo-suite/api-client", "commander"],
});
