// Copies the specclaw mock (the source of truth for the UI) into public/ so the
// static export serves it unchanged at /mock/.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/mock", { recursive: true });
cpSync(".specclaw/mock/index.html", "public/mock/index.html");
console.log("copied .specclaw/mock/index.html -> public/mock/index.html");
