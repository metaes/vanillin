import { createDOMElementFromURL, vanillinEval } from "../vanillin-0";

export function Link({ element }, c, cerr, env, config) {
  let href;
  if (element.getAttribute("rel") === "include" && (href = element.getAttribute("href"))) {
    createDOMElementFromURL(
      href,
      function(inclusion) {
        if (Array.isArray(inclusion)) {
          const container = document.createElement("div");
          element.insertAdjacentElement("afterend", container);
          inclusion.forEach(node => container.appendChild(node));
        } else {
          element.insertAdjacentElement("afterend", inclusion);
        }
        vanillinEval(inclusion, c, cerr, env, config);
      },
      cerr
    );
  } else {
    c();
  }
}
