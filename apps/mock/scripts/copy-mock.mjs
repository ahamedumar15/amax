import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/mock", { recursive: true });
cpSync("../../.specclaw/mock/index.html", "public/mock/index.html");
// 064: the marketing mock plays the real product video from media/.
cpSync("../../.specclaw/mock/media", "public/mock/media", { recursive: true });
console.log("copied the specclaw mock to public/mock/index.html");
