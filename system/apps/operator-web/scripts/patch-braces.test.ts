import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const braces = require("braces");
describe("braces depth mitigation", () => {
  it("preserves ordinary compile and expansion", () => {
    expect(braces("src/{app,server}/*.ts")).toEqual(["src/(app|server)/*.ts"]);
    expect(braces.expand("{a,b}")).toEqual(["a", "b"]);
  });
  it.each(["compile", "expand", "stringify"])(
    "%s rejects deep patterns without exhausting the stack",
    (method) => {
      expect(() => braces[method]("{".repeat(2000) + "a,b" + "}".repeat(2000))).toThrow(
        SyntaxError,
      );
    },
  );
  it("also limits parentheses and caller-supplied ASTs", () => {
    expect(() => braces.parse("(".repeat(2000) + "x" + ")".repeat(2000))).toThrow(SyntaxError);
    let ast = { nodes: [] };
    for (let i = 0; i < 1000; i++) ast = { nodes: [ast] } as typeof ast;
    expect(() => braces.compile(ast)).toThrow(SyntaxError);
  });
});
