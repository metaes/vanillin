require("source-map-support").install();

export function patch() {
  const Module = require("module");
  const _resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(path, parentModule, isMain) {
    try {
      return _resolveFilename.apply(this, arguments);
    } catch (e) {
      for (let part of ["vanillin-extract", "vanillinjs", "metaes"]) {
        if (
          e.message.indexOf("Cannot find module") >= 0 &&
          path.startsWith(`${part}/`) &&
          !path.startsWith(`${part}/lib/`)
        ) {
          return _resolveFilename.apply(this, [path.replace(`${part}/`, `${part}/lib/`), parentModule, isMain]);
        }
      }
      throw e;
    }
  };
}
