import { ComponentConstructorArgs } from "./interpreter/vanillinEvaluateComponent";

export const load = <T>(path: string) => (..._: ComponentConstructorArgs) =>
  new Promise<T>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = path;
    window.exports = {};
    document.body.appendChild(script);
    script.addEventListener("load", () => {
      const ctor = window.exports!["default"];
      if (ctor) {
        resolve(ctor);
      } else {
        reject(new Error(`Loaded module '${path}' didn't export default value.`));
      }
      document.body.removeChild(script);
      delete window.exports;
    });
    script.addEventListener("error", e => {
      delete window.exports;
      document.body.removeChild(script);
      reject(e);
    });
  });
