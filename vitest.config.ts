import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./tests/setup.ts"],
        include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/modules/**", "src/shared/**"],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
})
