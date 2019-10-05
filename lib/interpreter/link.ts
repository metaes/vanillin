import { createDOMElementFromURL, vanillinEval, VanillinEvaluationConfig } from "../vanillin-0";

export function Link({ element }, c, cerr, env, config: VanillinEvaluationConfig) {
  let href;
  if (element.getAttribute("rel") === "include" && (href = element.getAttribute("href"))) {
    createDOMElementFromURL(
      href,
      function(inclusion) {
        if (Array.isArray(inclusion)) {
          // TODO: shouldn't that be a document fragment?
          const container = config.document.createElement("div"); 
          element.insertAdjacentElement("afterend", container);
          inclusion.forEach(node => container.appendChild(node));
        } else {
          element.insertAdjacentElement("afterend", inclusion);
        }
        vanillinEval(inclusion, c, cerr, env, config);
      },
      cerr,
      env,
      config
    );
  } else {
    c();
  }
}
