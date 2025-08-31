import react from "@vitejs/plugin-react";
import glob from "glob";
import { resolve } from "path";
import { defineConfig } from "vite";

const buildRollupInput = (isDevelopment): { [entryAlias: string]: string } => {
  const rollupInput: { [entryAlias: string]: string } = isDevelopment
    ? {
        "dev.tsx": resolve(__dirname, "./src/dev.tsx"),
      }
    : {
        index: resolve(__dirname, "./index.html"),
      };

  // TODO: use import.meta.glob() + npm uninstall glob

  if (!isDevelopment) {
    // In production mode, we already have the main entry point
    return rollupInput;
  }

  glob
    .sync(resolve(__dirname, "./bundles/**/*.tsx"))
    .map((inputEntry: string) => {
      let outputEntry = inputEntry;
      // output entry is an absolute path, let's remove the absolute part:
      outputEntry = outputEntry.replace(`${__dirname}/`, "");
      // replace directory separator with "__"
      outputEntry = outputEntry.replace(/\//g, "__");

      rollupInput[outputEntry] = inputEntry;
    });

  return rollupInput;
};

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const { default: tsconfigPaths } = await import("vite-tsconfig-paths");

  const config = {
    base: "/",
    clearScreen: false,
    build: {
      manifest: true,
      rollupOptions: {
        input: buildRollupInput(command === "serve"),
      },
    },
    define: {
      // When this variable is set, setupDevelopment.tsx will also be loaded!
      // See `dev.tsx` which is included in development.
      "import.meta.env.DEV_SERVER_PORT": String(process.env.DEV_SERVER_PORT),
    },
    plugins: [react(), tsconfigPaths()],

    server: {
      port: 21012,
      host: "0.0.0.0",
      cors: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      },
      proxy: {
        // with options
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
        "/graphql": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  };

  return config;
});
