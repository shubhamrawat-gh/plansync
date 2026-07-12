export interface ExtractedContract {
  module_name: string;
  function_name: string;
  signature: string;
  file_path: string;
}

export function extractContracts(filePath: string, content: string): ExtractedContract[] {
  const contracts: ExtractedContract[] = [];
  
  // Extract module name from file name (e.g. src/auth.ts -> auth)
  const pathParts = filePath.split("/");
  const fileName = pathParts[pathParts.length - 1];
  const moduleName = fileName.replace(/\.(ts|js|tsx|jsx|py)$/, "");

  const isPython = filePath.endsWith(".py");

  if (isPython) {
    // Regex for python functions: def function_name(args) -> return_type:
    // Support multiline signature detection by parsing line-by-line or using regex with dotAll flags if supported,
    // but line-by-line/block parsing is safer in workers.
    const pythonDefRegex = /^\s*def\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(->\s*([^:]+))?:/gm;
    let match;
    while ((match = pythonDefRegex.exec(content)) !== null) {
      const functionName = match[1];
      const args = match[2].replace(/\s+/g, " ").trim();
      const returnType = match[4] ? match[4].trim() : "None";
      const signature = `(${args}) -> ${returnType}`;
      contracts.push({
        module_name: moduleName,
        function_name: functionName,
        signature,
        file_path: filePath,
      });
    }
  } else {
    // JS/TS files
    // 1. Match: export function name(args): type
    const tsFuncRegex = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(:\s*([^{]+))?/gm;
    let match;
    while ((match = tsFuncRegex.exec(content)) !== null) {
      const functionName = match[1];
      const args = match[2].replace(/\s+/g, " ").trim();
      const returnType = match[4] ? match[4].trim() : "any";
      const signature = `(${args}): ${returnType}`;
      contracts.push({
        module_name: moduleName,
        function_name: functionName,
        signature,
        file_path: filePath,
      });
    }

    // 2. Match: export const name = (args): type =>
    const tsArrowRegex = /export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([\s\S]*?)\)\s*(:\s*([^=]+))?\s*=>/gm;
    while ((match = tsArrowRegex.exec(content)) !== null) {
      const functionName = match[1];
      const args = match[2].replace(/\s+/g, " ").trim();
      const returnType = match[4] ? match[4].trim() : "any";
      const signature = `(${args}) => ${returnType}`;
      contracts.push({
        module_name: moduleName,
        function_name: functionName,
        signature,
        file_path: filePath,
      });
    }
  }

  return contracts;
}
