import { describe, expect, it } from "vitest";
import type { CardForm } from "@amax/core";
import { CHECK_FAILED, NotPendingError } from "@amax/chat";
import { checkResultOf, generalOf, refusalOf } from "../components/chat/form-values";
import { checkFailure } from "../lib/chat-outcome";

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
    ["a check that couldn't run is a note, never a block", CHECK_FAILED, { check: {}, notice: "Couldn't check that just now." }],
    ["a refusal by a field blocks by it", { field: "key", message: "CON is taken" }, { check: { field: "key", message: "CON is taken" } }],
    ["a card no longer open blocks", { message: "This card is no longer open. Ask again for a new one." }, { check: { message: "This card is no longer open. Ask again for a new one." } }],
    ["a passing check clears it", {}, { check: {} }],
  ])("B1 a live check's result: %s", (_name, result, expected) => {
    expect(checkResultOf(result)).toEqual(expected);
  });

  it("B1 the server's passing failure is the client's own: one rule, one message", () => {
    expect(checkFailure(new Error("db down"))).toBe(CHECK_FAILED);
    expect(checkFailure(new NotPendingError("confirmed"))).not.toHaveProperty("transient");
  });
});
