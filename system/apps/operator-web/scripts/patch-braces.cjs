// Temporary mitigation for GHSA-vfj7-8cjw-p6xm in braces 3.0.3.
// Apply on every install; fail loudly on unexpected upstream source changes.
/* eslint-disable @typescript-eslint/no-require-imports -- npm lifecycle CommonJS entrypoint */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const guard = `'use strict';
module.exports = ast => {
  const stack = [[ast, 0]];
  let visits = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (depth > 128 || ++visits > 50000) throw new SyntaxError('Brace AST exceeds safe depth or size');
    if (node && Array.isArray(node.nodes)) {
      for (const child of node.nodes) stack.push([child, depth + 1]);
    }
  }
};
`;
const marker = "// 3P depth guard: GHSA-vfj7-8cjw-p6xm";
for (const location of Object.keys(lock.packages).filter((key) =>
  /(?:^|\/)node_modules\/braces$/.test(key),
)) {
  const directory = path.resolve(root, location);
  if (!directory.startsWith(root + path.sep)) throw new Error("Unexpected dependency path");
  if (!fs.existsSync(directory)) continue; // Optional packages may not be installed.
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  if (pkg.version !== "3.0.3")
    throw new Error("Reassess the braces mitigation for the new upstream version");
  const replacements = {
    "parse.js": [
      "stack.push(block);",
      "if (stack.length >= 128) throw new SyntaxError('Brace pattern exceeds safe depth');\n      stack.push(block);",
    ],
    "compile.js": [
      "const compile = (ast, options = {}) => {",
      "const compile = (ast, options = {}) => {\n  require('./depth-guard')(ast);",
    ],
    "expand.js": [
      "const expand = (ast, options = {}) => {",
      "const expand = (ast, options = {}) => {\n  require('./depth-guard')(ast);",
    ],
    "stringify.js": [
      "module.exports = (ast, options = {}) => {",
      "module.exports = (ast, options = {}) => {\n  require('./depth-guard')(ast);",
    ],
  };
  for (const [file, [before, after]] of Object.entries(replacements)) {
    const target = path.join(directory, "lib", file);
    const source = fs.readFileSync(target, "utf8");
    if (source.includes(marker)) continue;
    const occurrences = source.split(before).length - 1;
    if (occurrences !== (file === "parse.js" ? 2 : 1))
      throw new Error(`Unexpected braces source in ${file}`);
    fs.writeFileSync(target, marker + "\n" + source.split(before).join(after));
  }
  fs.writeFileSync(path.join(directory, "lib", "depth-guard.js"), guard);
}
console.log("braces: depth guard applied.");
