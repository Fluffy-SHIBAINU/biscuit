import { config } from "dotenv";
config({ path: ".env.local", override: true });

// Tests inject readers; the live second reader is never switched on by .env.local here.
process.env.READER_SECOND = "off";
