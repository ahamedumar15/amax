import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WelcomePage from "../app/(public)/welcome/page";
import { DESCRIPTION } from "../components/marketing/copy";
import { QUEUES } from "../components/marketing/queues";

const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<p class="mk-coming">[\s\S]*?<\/p>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

const mockSection = () => {
  const mock = readFileSync(new URL("../../../.specclaw/mock/index.html", import.meta.url), "utf8");
  const start = mock.indexOf('<section data-change="064-marketing-revamp"');
  if (start < 0) throw new Error("the 064 mock section is missing");
  const end = mock.indexOf("<!-- =====", start);
  if (end < 0) throw new Error("the 064 mock section has no end marker");
  return text(mock.slice(start, end));
};

export const surfaces = (): [string, string][] => [
  ["rendered page", text(renderToStaticMarkup(createElement(WelcomePage)))],
  ["description", DESCRIPTION],
  ["every queue card", Object.values(QUEUES).flat().map((c) => `${c.title}. ${c.detail}. ${c.by}. ${c.action}. ${c.done}.`).join("\n")],
  ["captions", readFileSync(new URL("../public/marketing/amax-product.en.vtt", import.meta.url), "utf8")],
  ["mock 064 section", mockSection()],
];

export const sentences = (body: string, pattern: RegExp) => body.split(/(?<=[.!?])\s+|\n+/).filter((s) => pattern.test(s));
