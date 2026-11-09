declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    YANDEX_API_KEY?: string;
    YANDEX_FOLDER_ID?: string;
    OWNER_ACCESS_KEY_HASH?: string;
    MAIL_TEST_ACCOUNT?: string;
    MAIL_TEST_PASSWORD?: string;
    MAIL_TEST_PATH?: string;
    MAIL_WORK_ACCOUNT?: string;
    MAIL_WORK_PASSWORD?: string;
    MAIL_WORK_PATH?: string;
    MAIL_ACTIVE_PROFILE?: string;
  }
}
