import { describe, expect, it } from "vitest";
import type { CardForm } from "@amax/core";
import { edited, generalOf, refusalOf } from "../components/chat/form-values";

const form: CardForm = { fields: [{ name: "key", label: "Key", kind: "text" }, { name: "client", label: "Client", kind: "chips", options: [], other: "+ new…" }] };

describe("106 review round 1: the form card's refusals and values", () => {
  it.each([
    ["a field on the form blocks, next to it", "CON is taken", "key", { check: { field: "key", message: "CON is taken" } }],
    ["a retry note that names no field leaves the button alone", "That didn't work: try again", undefined, { check: {}, notice: "That didn't work: try again" }],
    ["a field the form doesn't have is a note too", "project not found", "projectKey", { check: {}, notice: "project not found" }],
    ["no note clears it", undefined, undefined, { check: {} }],
  ])("B12 a server refusal: %s", (_name, message, field, expected) => {
    expect(refusalOf(form, message, field)).toEqual(expected);
  });

  it.each([
    ["no field", { message: "check the fields" }, "check the fields"],
    ["a field the form doesn't have", { field: "projectKey", message: "Fill this in" }, "Fill this in"],
    ["a field on the form shows by that field instead", { field: "key", message: "CON is taken" }, undefined],
    ["a passing check", {}, undefined],
  ])("B3 a live check's refusal shows above the button for %s", (_name, check, expected) => {
    expect(generalOf(form, check)).toBe(expected);
  });

  it.each([
    ["Northwind Traders", "Northwind Traders"],
    ["  Acme Co Ltd ", "Acme Co Ltd"],
    ["Wide World Importers ", "Wide World Importers"],
  ])("B12 a typed client of several words is kept whole, trimmed only when sent: %j", (typed, sent) => {
    expect(edited(form, { key: "NWP", client: typed })).toEqual({ key: "NWP", client: sent });
  });
});
