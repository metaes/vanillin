import { createDOMElementFromURL, vanillinEval, VanillinEvaluationConfig } from "../vanillin-0";

export function Link({ element }: { element: HTMLElement }, c, cerr, env, config: VanillinEvaluationConfig) {
  let href;
  if (element.getAttribute("rel") === "include" && (href = element.getAttribute("href"))) {
    createDOMElementFromURL(
      href,
      function(inclusion) {
        const inclusionChildren = Array.from(inclusion.childNodes);
        const parent = element.parentNode;
        parent!.insertBefore(inclusion, element);
        parent.removeChild(element);
        vanillinEval(inclusionChildren, c, cerr, env, config);
      },
      cerr,
      env,
      config
    );
  } else {
    c();
  }
}
