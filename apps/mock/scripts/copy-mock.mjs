import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/mock", { recursive: true });
cpSync("../../.specclaw/mock/index.html", "public/mock/index.html");
console.log("copied the specclaw mock to public/mock/index.html");
