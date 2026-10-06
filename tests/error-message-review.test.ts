/**
 * Turning a thrown thing into something worth showing a person.
 *
 * `errorMessage` is the last line between a Convex failure and the screen, so
 * two kinds of mistake matter and neither is visible in a screenshot:
 *
 *   • Showing an internal identifier. When Convex cannot serialize an error it
 *     substitutes a placeholder naming the function that failed —
 *     `[CONVEX A(auth:signIn)]`. That reached the driver-registration screen
 *     verbatim, so a person who mistyped nothing at all was told, in effect,
 *     "auth:signIn is broken".
 *   • Hiding a real message. A thrown `Error("That password is wrong.")` is
 *     exactly the text the person needs, and over-eager filtering turns it
 *     into "Something went wrong", which helps nobody.
 *
 * The rule this file pins: strip Convex's plumbing, keep Convex's sentences.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { errorMessage } from "@/lib/errors";

describe("a real, thrown message is shown as-is", () => {
  test("a plain error reaches the person untouched", () => {
    expect(errorMessage(new Error("That password is not correct."))).toBe(
      "That password is not correct.",
    );
  });

  test("a validation message from the server is not filtered away", () => {
    // This is the whole reason the helper exists: `saveVehicle` and
    // `createProfile` throw plain-language errors meant to be read.
    expect(errorMessage(new Error("Rider profile not found."))).toBe(
      "Rider profile not found.",
    );
    expect(errorMessage(new Error("Use at least 10 characters."))).toBe(
      "Use at least 10 characters.",
    );
  });

  test("a thrown string is handled like a thrown error", () => {
    expect(errorMessage("Enter a valid mobile number (10–15 digits).")).toBe(
      "Enter a valid mobile number (10–15 digits).",
    );
  });
});

describe("Convex's plumbing never reaches the person", () => {
  test("an unserializable action error becomes the fallback, not a function name", () => {
    // The live bug: `[CONVEX A(auth:signIn)]` was rendered on the register
    // screen. It names an internal function and explains nothing.
    expect(errorMessage(new Error("[CONVEX A(auth:signIn)]"), "Could not sign you in.")).toBe(
      "Could not sign you in.",
    );
  });

  test("the same holds for a query placeholder and for request metadata", () => {
    expect(errorMessage(new Error("[CONVEX Q(profiles:getMyProfile)]"), "Nope.")).toBe(
      "Nope.",
    );
    expect(
      errorMessage(
        new Error("[CONVEX A(auth:signIn)]\n[Request ID: d0bafc5ee4913fc0] Server Error"),
        "Nope.",
      ),
    ).toBe("Nope.");
  });

  test("the placeholder is matched on its own line, not mid-sentence", () => {
    // Anchored, so a message that merely mentions one still reads normally.
    expect(errorMessage(new Error("Could not reach [CONVEX A(x)] right now."))).toBe(
      "Could not reach [CONVEX A(x)] right now.",
    );
  });

  test("a request id and stack are stripped from a readable message", () => {
    expect(
      errorMessage(
        new Error("Rider profile not found.\n[Request ID: abc123] Server Error\n    at foo"),
      ),
    ).toBe("Rider profile not found.");
  });

  test("'Uncaught Error:' is stripped but its sentence is kept", () => {
    expect(errorMessage(new Error("Uncaught Error: Rider profile not found."))).toBe(
      "Rider profile not found.",
    );
  });

  test("a url, a server error, and nothing at all all fall back", () => {
    expect(errorMessage(new Error("https://internal.example/trace/1"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(errorMessage(new Error("Server Error"), "Try again.")).toBe("Try again.");
    expect(errorMessage(new Error(""), "Try again.")).toBe("Try again.");
    expect(errorMessage(null, "Try again.")).toBe("Try again.");
    expect(errorMessage(undefined, "Try again.")).toBe("Try again.");
  });
});
