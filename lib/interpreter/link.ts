import { createDOMElementFromURL, vanillinEval, VanillinEvaluationConfig } from "../vanillin-0";

export function Link({ element }, c, cerr, env, config: VanillinEvaluationConfig) {
  const {
    window: { document }
  } = config;

  let href;
  if (element.getAttribute("rel") === "include" && (href = element.getAttribute("href"))) {
    createDOMElementFromURL(
      href,
      function(inclusion) {
        const wrapper = document.createElement("div");
        wrapper.appendChild(inclusion);
        element.appendChild(wrapper);
        vanillinEval(wrapper, c, cerr, env, config);
      },
      cerr,
      env,
      config
    );
  } else {
    c();
  }
}
