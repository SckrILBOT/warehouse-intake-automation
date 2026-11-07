declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    YANDEX_API_KEY?: string;
    YANDEX_FOLDER_ID?: string;
    OWNER_ACCESS_KEY_HASH?: string;
  }
}
