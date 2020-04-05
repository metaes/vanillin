import { promises as fs } from "fs";
import { describe, it } from "mocha";
import { parse, getConfig } from "vanillin-extract";
import { bindDOM } from "../lib/vanillin-0";
import * as chai from "chai";

describe("From HTML tests", async function () {
  const dir = process.cwd() + "/test";
  const isHTMLFile = (d) => d.substring(d.lastIndexOf(".") + 1) === "html";
  const readFile = async (file) => ({ name: file, contents: (await fs.readFile(dir + "/" + file)).toString() });

  const testFiles = await Promise.all((await fs.readdir(dir)).filter(isHTMLFile).map(readFile));

  for (let { contents } of testFiles) {
    for (let element of parse(contents)) {
      if (element.nodeName === "describe") {
        describe(element.childNodes[0].textContent.trim(), function () {
          for (let insideDescribeNode of element.childNodes) {
            if (insideDescribeNode.nodeName === "test") {
              it(insideDescribeNode.childNodes[0].textContent.trim(), async function () {
                return new Promise(function (resolve, reject) {
                  bindDOM(
                    insideDescribeNode.childNodes.slice(1),
                    resolve,
                    (e) => reject(e.value || e),
                    { testElement: insideDescribeNode, chai },
                    getConfig()
                  );
                });
              });
            }
          }
        });
      }
    }
  }
});
