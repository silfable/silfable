import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const rendererSource = fileURLToPath(new URL("./src/renderer/src", import.meta.url));

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ["@silfable/contracts"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
      externalizeDeps: {
        exclude: ["@silfable/contracts"],
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": rendererSource,
      },
    },
  },
});
