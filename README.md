# Vanillin (preview)

Vanillin is a JavaScript DOM user interface library.

Try it out at the [playground](http://metaes.org/playground.html).

## Installing

For the latest stable version:

```bash
npm install vanillinjs
```

For dev builds:

```bash
npm install vanillinjs@dev
```

## Using Vanillin

1. With including global library:

    `index.html`:

    ```html
    <button onclick="onclick()">Click</button>
    <script src="node_modules/vanillinjs/vanillin.bundle.js"></script> <!-- Or any other bundle location -->
    <script>
      vanillin.bindDOM(document.querySelector("button"), console.log, console.error, {
        onclick() {
          console.log("clicked");
        }
      });
    </script>
    ```

2. With webpack:

    ```bash
    $ npm install webpack webpack-cli
    ```

    `index.js`:

    ```javascript
    import { bindDOM } from "vanillinjs/vanillin-0";
    bindDOM(document.querySelector("button"), console.log, console.error, {
      onclick() {
        console.log("clicked");
      }
    });
    ```

    or

    ```javascript
    import vanillin from "vanillinjs";
    vanillin.bindDOM(document.querySelector("button"), console.log, console.error, {
      onclick() {
        console.log("clicked");
      }
    });
    ```

    Build with `webpack.config.js`:

    ```javascript
    const path = require("path");

    module.exports = {
      entry: "./index.js",
      output: {
        path: path.resolve(__dirname),
        filename: "bundle.js"
      }
    };
    ```

    run:

    ```bash
    $ webpack
    ```

    and run `index.html` page:

    ```html
    <button onclick="onclick()">Click</button>
    <script src="bundle.js"></script>
    ```

## Documentation

Available at [docs](http://metaes.org/docs-vanillin.html) page and on [GitHub](docs/main.md) repository.

## Development

For development repository installation use following:

```bash
git clone git@github.com:metaes/vanillin.git
cd vanillin
npm install
```

## Contribution

Use GitHub [issues](https://github.com/metaes/vanillin/issues) or [pull requests](https://github.com/metaes/vanillin/pulls).

## License

MIT.
