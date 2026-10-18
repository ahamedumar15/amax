import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WelcomePage from "../app/(public)/welcome/page";
import { DESCRIPTION } from "../components/marketing/copy";

const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<p class="mk-coming">[\s\S]*?<\/p>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

const mockSection = () => {
  const mock = readFileSync(new URL("../../../.specclaw/mock/index.html", import.meta.url), "utf8");
  const start = mock.indexOf('<section data-change="062-marketing-site"');
  if (start < 0) throw new Error("the 062 mock section is missing");
  return text(mock.slice(start, mock.indexOf("</section>", start)));
};

export const surfaces = (): [string, string][] => [
  ["rendered page", text(renderToStaticMarkup(createElement(WelcomePage)))],
  ["description", DESCRIPTION],
  ["captions", readFileSync(new URL("../public/marketing/amax-product.en.vtt", import.meta.url), "utf8")],
  ["mock 062 section", mockSection()],
];

export const sentences = (body: string, pattern: RegExp) => body.split(/(?<=[.!?])\s+|\n+/).filter((s) => pattern.test(s));
