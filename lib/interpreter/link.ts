import { createDOMElementFromURL, vanillinEval, VanillinEvaluationConfig } from "../vanillin-0";

export function Link({ element }, c, cerr, env, config: VanillinEvaluationConfig) {
  let href;
  if (element.getAttribute("rel") === "include" && (href = element.getAttribute("href"))) {
    createDOMElementFromURL(
      href,
      function(inclusion) {
        const container = config.document.createElement("div");
        container.appendChild(inclusion);
        element.insertAdjacentElement("afterend", container);
        vanillinEval(container, c, cerr, env, config);
      },
      cerr,
      env,
      config
    );
  } else {
    c();
  }
}
