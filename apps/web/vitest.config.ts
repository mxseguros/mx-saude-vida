import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["testes/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Ver `testes/apoio/server-only.ts`: sem este alias, nenhum modulo com
      // `import "server-only"` pode ser testado.
      "server-only": fileURLToPath(new URL("./testes/apoio/server-only.ts", import.meta.url)),
    },
  },
});
