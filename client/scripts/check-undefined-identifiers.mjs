import path from "node:path";
import ts from "typescript";

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("Could not find client tsconfig.json");

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noCheck: false, noEmit: true });
const missingNames = ts.getPreEmitDiagnostics(program).filter((diagnostic) => [2304, 2552].includes(diagnostic.code));

if (missingNames.length) {
  for (const diagnostic of missingNames) {
    const location = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const file = diagnostic.file?.fileName ?? configPath;
    const line = location ? `:${location.line + 1}:${location.character + 1}` : "";
    console.error(`${file}${line} TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  }
  process.exit(1);
}

console.log("No undefined TypeScript identifiers found.");
