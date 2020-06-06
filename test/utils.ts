import { Link } from "../lib/interpreter/link";
import { getVanillinInterpreters } from "../lib/interpreter/vanillinInterpreters";
import { WindowNode } from "vanillin-extract";

export const getConfig = (baseURI?: string) => ({
  window: new WindowNode(baseURI),
  interpreters: {
    prev: getVanillinInterpreters(),
    values: {
      Link,
      VanillinExtra({ element }, c, cerr, env, config) {
        const statements: string[] = [];

        if (element.nodeName.toLowerCase() === "link") {
          statements.push("Link");
        }

        config.context.evaluate(
          {
            type: "BlockStatement",
            body: statements.map((type) => ({ type, element }))
          },
          c,
          cerr,
          env,
          config
        );
      }
    }
  }
});
