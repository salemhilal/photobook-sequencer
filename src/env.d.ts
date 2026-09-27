/** The app's version from package.json, inlined by Vite at build time. */
declare const __APP_VERSION__: string;

/** Whether this is the native Mac app's build (`vite --mode app`), not the website's. */
declare const __NATIVE_APP__: boolean;

/** Whether this is the Mac app's end-to-end test build (see src/e2e.ts). */
declare const __E2E__: boolean;
