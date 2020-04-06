require("../patch").patch();

import { defaultScheduler } from "metaes/evaluate";
import { noop } from "metaes/metaes";
import { Environment } from "metaes/types";
import { describe, it, beforeEach } from "mocha";
import { getConfig } from "vanillin-extract";
import { bindDOM } from "../vanillin-0";
import { defineComponent } from "../vanillinEnvironment";
import * as chai from "chai";

describe("Vanillin components", function () {
  describe("Programmatic definition", function () {
    let components: Environment;

    beforeEach(function () {
      components = { values: {} };
    });

    it("supports template string", function () {
      defineComponent(components, "component1", { templateString: "test" });

      const dom = bindDOM(
        `<component1 />`,
        noop,
        console.error,
        {},
        { ...getConfig(), interpreters: components, schedule: defaultScheduler }
      );
      chai.assert.equal(dom.toSource(), `<component1>test</component1>`);
    });

    it("supports template url", async function () {
      defineComponent(components, "component1", { templateUrl: "template_url.html" });
      const config = getConfig();
      config.window.fetch = async function fetch(url: string) {
        return {
          async text() {
            return `test`;
          },
          ok: true
        };
      };
      let dom;
      await new Promise(function (resolve, reject) {
        dom = bindDOM(`<component1 />`, resolve, reject, {}, { ...config, interpreters: components });
      });
      chai.assert.equal(dom.toSource(), `<component1>test</component1>`);
    });

    it("supports html element", function () {
      const config = getConfig();
      const textNode = config.window.document.createTextNode() as Node;
      textNode.textContent = "test";
      defineComponent(components, "component1", { templateNode: textNode });

      const dom = bindDOM(
        `<component1 />`,
        noop,
        console.error,
        {},
        { ...getConfig(), interpreters: components, schedule: defaultScheduler }
      );
      chai.assert.equal(dom.toSource(), `<component1>test</component1>`);
    });
  });
});
