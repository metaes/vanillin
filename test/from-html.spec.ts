import { uncpsp } from "metaes/metaes";
import * as chai from "chai";
import * as fs from "fs";
import { defaultScheduler } from "metaes/evaluate";
import { describe, it } from "mocha";
import { parse } from "vanillin-extract";
import { bindDOM } from "../lib/vanillin-0";
import { getConfig } from "./utils";

describe("From HTML tests", async function () {
  const dir = process.cwd() + "/test";
  const isHTMLFile = (d) => d.substring(d.lastIndexOf(".") + 1) === "html";
  const readFile = (file) => ({ name: file, contents: fs.readFileSync(dir + "/" + file).toString() });
  const testFiles = fs.readdirSync(dir).filter(isHTMLFile).map(readFile);

  const globalEnv = { console, chai, Array, setTimeout };
  const config = getConfig();

  for (let { contents } of testFiles) {
    for (let element of parse(contents, config.window)) {
      if (element.nodeName === "describe") {
        describe(element.childNodes[0].textContent.trim(), function () {
          for (let insideDescribeNode of element.childNodes) {
            if (insideDescribeNode.nodeName === "test") {
              const testName = insideDescribeNode.childNodes[0].textContent.trim();

              async function body() {
                try {
                  return await uncpsp(bindDOM)(
                    insideDescribeNode.childNodes.slice(1),
                    { ...globalEnv, testElement: insideDescribeNode },
                    { ...config, schedule: defaultScheduler }
                  );
                } catch (e) {
                  throw e.value?.message || e.message;
                }
              }

              if (testName.includes(":skip")) {
                it.skip(testName, body);
              } else if (testName.includes(":only")) {
                it.only(testName, body);
              } else {
                it(testName, body);
              }
            }
          }
        });
      }
    }
  }
  it("noop", () => {});
});
