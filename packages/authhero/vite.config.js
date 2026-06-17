var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import path from "path";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
var getPackageName = function () {
    return "authhero";
};
var getPackageNameCamelCase = function () {
    try {
        return getPackageName().replace(/-./g, function (char) { return char[1].toUpperCase(); });
    }
    catch (err) {
        throw new Error("Name property in package.json is missing.");
    }
};
var fileName = {
    es: "".concat(getPackageName(), ".mjs"),
    cjs: "".concat(getPackageName(), ".cjs"),
};
var formats = Object.keys(fileName);
export default defineConfig(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var visualizer;
    var mode = _b.mode;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                // Client build configuration
                if (mode === "client") {
                    return [2 /*return*/, {
                            build: {
                                emptyOutDir: false, // Don't wipe CSS files built earlier
                                rollupOptions: {
                                    input: path.resolve(__dirname, "src/client/index.tsx"),
                                    output: {
                                        entryFileNames: "client.js",
                                        format: "es",
                                    },
                                },
                                outDir: "./dist",
                            },
                            esbuild: {
                                jsxImportSource: "hono/jsx/dom",
                            },
                        }];
                }
                return [4 /*yield*/, import("rollup-plugin-visualizer")];
            case 1:
                visualizer = (_c.sent()).visualizer;
                return [2 /*return*/, {
                        base: "./",
                        define: {
                            "process.env.AUTHHERO_BUILD_HASH": JSON.stringify(Date.now().toString(36)),
                        },
                        build: {
                            emptyOutDir: false, // Don't wipe CSS/JS files built earlier
                            outDir: "./dist",
                            lib: {
                                entry: path.resolve(__dirname, "src/index.ts"),
                                name: getPackageNameCamelCase(),
                                formats: formats,
                                fileName: function (format) { return fileName[format]; },
                            },
                            rollupOptions: {
                                external: ["@hono/zod-openapi", "hono", "@authhero/widget/hydrate"],
                                output: {
                                    assetFileNames: function (assetInfo) {
                                        if (assetInfo.name === "style.css")
                                            return "tailwind.css";
                                        return assetInfo.name || "";
                                    },
                                },
                                plugins: [
                                    visualizer({
                                        filename: "./dist/stats.html",
                                        open: false,
                                        gzipSize: true,
                                        brotliSize: true,
                                    }),
                                ],
                            },
                        },
                        css: {
                            postcss: {
                                plugins: [tailwindcss(), autoprefixer()],
                            },
                        },
                        resolve: {
                            alias: [
                                { find: "@", replacement: path.resolve(__dirname, "src") },
                                { find: "@@", replacement: path.resolve(__dirname) },
                                // Resolve @authhero/saml subpaths to dist files for tests
                                {
                                    find: "@authhero/saml/core",
                                    replacement: path.resolve(__dirname, "../saml/dist/core.mjs"),
                                },
                                {
                                    find: "@authhero/saml/local-signer",
                                    replacement: path.resolve(__dirname, "../saml/dist/local-signer.mjs"),
                                },
                                {
                                    find: "@authhero/saml",
                                    replacement: path.resolve(__dirname, "../saml/dist/saml.mjs"),
                                },
                            ],
                        },
                    }];
        }
    });
}); });
