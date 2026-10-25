/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SERVICES_URL?: string;
  readonly PUBLIC_STAFF_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
