require("../patch").patch();

import { defaultScheduler } from "metaes/evaluate";
import { noop } from "metaes/metaes";
import { Environment } from "metaes/types";
import { describe, it, beforeEach } from "mocha";
import { getConfig } from "vanillin-extract";
import { bindDOM } from "../vanillin-0";
import { defineComponent } from "../vanillinEnvironment";
import { assert } from "chai";

describe("Vanillin components", function () {
  let interpreters: Environment;

  beforeEach(function () {
    interpreters = { values: {} };
  });

  describe("Programmatic definition", function () {
    it("supports template string", function () {
      defineComponent(interpreters, "component1", { templateString: "test" });

      const dom = bindDOM(
        `<component1 />`,
        noop,
        console.error,
        {},
        { ...getConfig(), interpreters, schedule: defaultScheduler }
      );
      assert.equal(dom.toSource(), `<component1>test</component1>`);
    });

    it("supports template url", async function () {
      defineComponent(interpreters, "component1", { templateUrl: "template_url.html" });
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
        dom = bindDOM(`<component1 />`, resolve, reject, {}, { ...config, interpreters });
      });
      assert.equal(dom.toSource(), `<component1>test</component1>`);
    });

    it("supports html element", function () {
      const config = getConfig();
      const textNode = config.window.document.createTextNode() as Node;
      textNode.textContent = "test";
      defineComponent(interpreters, "component1", { templateNode: textNode });

      const dom = bindDOM(
        `<component1 />`,
        noop,
        console.error,
        {},
        { ...getConfig(), interpreters, schedule: defaultScheduler }
      );
      assert.equal(dom.toSource(), `<component1>test</component1>`);
    });

    it("supports closure", function () {
      defineComponent(interpreters, "component1", {
        templateString: `<span bind>message</span>`,
        closure: { values: { message: "hello world" } }
      });

      const dom = bindDOM(
        `<component1 />`,
        noop,
        console.error,
        {},
        { ...getConfig(), interpreters, schedule: defaultScheduler }
      );
      assert.equal(dom.toSource(), `<component1><span bind>hello world</span></component1>`);
    });
  });

  describe("Component constructor", function () {
    it("supports constructor", function () {
      let called;
      defineComponent(interpreters, "component1", {
        ctor() {
          called = true;
        }
      });
      bindDOM(`<component1 />`, noop, console.error, {}, { ...getConfig(), interpreters, schedule: defaultScheduler });
      assert.isTrue(called);
    });

    it("supports constructor returned value", function () {
      const events: string[] = [];
      defineComponent(interpreters, "component1", {
        ctor() {
          events.push("ctor");
          return {
            onbind() {
              events.push("onbind");
            },
            environment: { message: "hello world" }
          };
        },
        templateString: `<span bind>message</span>`,
        closure: { values: { world: "should be shadowed" } }
      });
      let dom = bindDOM(
        `<component1 />`,
        noop,
        console.error,
        {},
        { ...getConfig(), interpreters, schedule: defaultScheduler }
      );
      assert.equal(dom.toSource(), `<component1><span bind>hello world</span></component1>`);
      assert.deepEqual(events, ["ctor", "onbind"], "Incorrect calls order.");
    });

    it("supports async constructor", async function () {
      defineComponent(interpreters, "component1", {
        ctor: () =>
          Promise.resolve(function ctor() {
            return { environment: { message: "hello world" } };
          }),
        templateString: `<span bind>message</span>`
      });

      let dom;
      await new Promise(function (resolve, reject) {
        dom = bindDOM(`<component1 />`, resolve, reject, {}, { ...getConfig(), interpreters });
      });

      assert.equal(dom.toSource(), `<component1><span bind>hello world</span></component1>`);
    });

    // proper environment merging
    // returned environment can be full env
  });
});