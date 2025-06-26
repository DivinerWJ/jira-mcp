import { defineConfig } from "vite";
// import dts from "vite-plugin-dts";
import { resolve } from "path";
import { terser } from "rollup-plugin-terser";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "fs",
        "path",
        "@modelcontextprotocol/sdk/server/index.js",
        "@modelcontextprotocol/sdk/server/stdio.js",
        "@modelcontextprotocol/sdk/types.js",
      ],
      plugins: [terser()],
    },
    target: "node18",
    outDir: "build",
    sourcemap: true,
  },
  // plugins: [dts()],
});
