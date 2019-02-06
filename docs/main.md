# Vanillin docs (preview)

Caveat: document in progress, specifics may change. [Follow](https://github.com/metaes/vanillin) project for updates.

## About

Vanillin is a JavaScript DOM user interface library.

Vanillin uses Metaes interpreter underneath, meaning all MetaES's capabilities are immediately accessible and its design philosophy is preserved. [Read more about Metaes](./docs-metaes.html).

## How it works?

Vanillin follows idea of enhancing already existing DOM elements with JavaScript using inline HTML bindings. This pattern is powerful, but limited when using only native web standards lacking basic software development pieces like composition, isolation, modularization. All JavaScript code is evaluated in a single global scope. Vanillin polyfills missing parts.

Vanillin traverses DOM tree produced by browser in a top-down depth-first manner and for each visited node decides what to do next based on provided configuration, node properties and node attributes. It can be seen as an interpreter pattern.

Actions include modification of elements' text content, attributes values, cloning elements, removing elements and other.

## Installation

Follow [README.md](https://github.com/metaes/vanillin) on GitHub.

## Using Vanillin

Although not required, it is recommended to read first about MetaES. This will allow to understand how Vanillin works much easier. [Read here](./docs-metaes.html).

### bindDOM

Main function to use is `bindDOM`. `bindDOM`'s signature is similar to `metaesEval`. `bindDOM` additionally returns immediate value, which is only a pragmatic design choice for user convenience.

For example:

```js
bindDOM(`<button>Click</button>`, console.log);
```

will return `HTMLButtonElement` element and will log to console when function finishes.

You can add it to the DOM:

```js
document.body.appendChild(bindDOM(`<button>Click</button>`, console.log));
```

DOM elements like `HTMLButtonElement` are created using browser's [`DOMParser`](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser). `DOMParser` creates `Document` with elements inside its `<head>` or `<body>`, but Vanillin extracts them right away and returns single element or array of elements (not `NodeList`) depending on what was provided as a string.

If your DOM tree already has a button in `<body>` you can write:

HTML:

```html
<body>
    <button>Click</button>
</body>
```

JS:

```js
bindDOM(document.querySelector("button"));
```

`bindDOM` has also `environment` and `config` params as `metaesEval` has, but we'll come back to them in a moment.

### Events handlers binding

For the sake of examples simplicity let's focus on parsing DOM from strings, not taking references from existing DOM tree. This will allow skipping HTML file parts. `document.body.appendChild` is also skipped.

In this example:

```js
bindDOM(`<button onclick="console.log('clicked')">Click</button>`);
```

we're rebinding default click handler. When clicking on the button in the browser, we'll get an error: `ReferenceError: "console" is not defined.`. You should be no surprised nor disappointed. This is what we want - no implicit global scope.

JavaScript code in handlers is handled by MetaES. `ReferenceError` is easy to fix:

```js
bindDOM(`<button onclick="console.log('clicked')">Click</button>`, console.log, console.error, { console });
```

If for any reason you want to operate on global scope (not recommended in regular case), it's as easy as:

```js
bindDOM(`<button onclick="console.log('clicked')">Click</button>`, console.log, console.error, window);
```

Event handlers on HTML elements are rebound automatically using `addEventListener` for every attribute which name starts with `on` - rest of the name after `on` is the event name:

```js
bindDOM(
    `<input onkeydown="console.log('down', event)" onkeyup="console.log('up', event)" />`,
    console.log,
    console.error,
    { console }
);
```

Both `onkeydown` and `onkeyup` were bound with Vanillin.
New thing to note: `event` variable in handlers. It works the same way as in standard DOM. DOM event is bound to `event` reference. Try to run it without Vanillin. Result will be no different.

Other thing browser does is it bounds `this` to element on which an event occured. Vanillin also copies that:

```js
bindDOM(
    `<input onkeydown="console.log('down', event, this)" onkeyup="console.log('up', event, this)" />`,
    console.log,
    console.error,
    { console }
);
```

`this` will be bound to `HTMLInputElement` element.

Good design note: if inline handlers become to long, move them to a function:

```js
bindDOM(
    `<input onkeydown="onkey('down', event, this)" onkeyup="onkey('up', event, this)" />`,
    console.log,
    console.error,
    {
        console,
        onkey(type, event, element) {
            console.log(type, event, element);
        }
    }
);
```

In this example they aren't too long, but you should get the point. Also, some users may not like any logic in HTML. They should use functions everywhere they can. They can also manually use `addEventListener` to bind a [metaFunction](./docs-metaes.html#metafunction).

Example:

```js
const button = document.createElement("button");
button.textContent = "Click me";
metaesEval(
    event => console.log("metaFunction was called as event handler with event: ", event),
    handler => button.addEventListener("click", handler),
    console.error,
    { console }
);
document.body.appendChild(button);
```

This will be useful when handlers should modify variables observed by MetaES.

### `bind` attribute

Consider this example:

```js
bindDOM(`
    <script>var text;</script>
    <input type="text" oninput="text=this.value" />
    <br />
    Text is: <span bind>text</span>`).forEach(element => document.body.appendChild(element));
```

By the way, `bindDOM` will return an array here, you will have to add each of elements separetly. There is no helper function for that currently.

`bind` attribute makes Vanillin will:

-   get `textContent` of this element and treat it as JavaScript expression,
-   evaluate expression and set result back to `textContent` of that element.

Because `DOMParser` will produce DOM with `text` string as `textContent` of `<span>`, this will be a JavaScript expression. Think of it as a template pattern, but there is no template language, just JavaScript expressions. `text` is a variable defined in `<script>` tag. `<script>` tags are supported by Vanillin, they modify provided environment when there is a variable declarator.

Template expressions like `<span>{{value}}</span>` are not supported, but possible to implement when [extending Vanillin](./docs-vanillin.html#extending-vanillin).

### `bind-attrs` attribute

`bind-attrs` when used:

1.  takes comma separated list of attribute names,
2.  MetaES evaluates each of attributes current values,
3.  sets evaluated value to element's attribute,
4.  automatically observes.

Example:

```html
<script>
    var userName;
</script>
Input: <input type="text" oninput="userName=this.value" /> <br />
Reversed text: <input type="text" value="(userName || '').split('').reverse().join('')" bind-attrs="value" /> <br />
<label>Has any text? <input type="checkbox" checked="userName" bind-attrs="checked"/></label>
```

### State management

By "state" we consider any JavaScript objects that represent data of your app which should be persisted and/or displayed in UI. State is managed and propagated automatically based on MetaES's `ObservableContext`. There is no requirement for creating any abstractions, functions, helpers to change and propagate, as long `ObservableContext` is aware of actions user does. [Read more about `ObservableContext`](./docs-metaes.html#observable-context).

If not provided, Vanillin automatically creates `ObservableContext` inside `bindDOM` call and propagates the same context down to children. Therefore all changes initiated by any of descendants will be visible for any code that has access to `ObservableContext`.

Example:

```html
<script>
    var a;
</script>
<input type="text" oninput="a=this.value" />
<p bind>a</p>
```

`a` value is observed and rendered inside `<p>` every time new value is assigned to `a`.

Worth noting, user can create multiple `ObservableContexts` for multiple `bindDOM` calls completely separated from each other and at will manually propagate changes between those contexts. There is no single global state. Internally, state is always passed as an argument, just like `config` or `environment` in MetaES nodes interpreters.

#### Chaining observations

Consider:

```html
<script>
    var a, b;
</script>
<input type="text" oninput="a=this.value" />
<p bind>(b = a ? a.toUpperCase() : ''), a</p>
<p bind>b</p>
```

`b` is never set directly by user action; it's changed as a consequence of `a` change. Chained observations are not an explicitly designed, they are byproduct of ObservableContext nature. Currently there is no protection against circular chains.

As a reminder:

```javascript
(b = a ? a.toUpperCase() : ""), a;
```

represents _Sequence Expression_, which evaluates all comma separated expressions in order and as result returns value of last expresssion.

More advanced example:

```javascript
let metaFetch;
metaesEval(`path=>callcc(fetcher, path)`, fn => (metaFetch = fn), console.error, {
    fetcher: (path, c, cerr) =>
        fetch(path)
            .then(d => d.json())
            .then(c)
            .catch(cerr),
    callcc: callWithCurrentContinuation
});

document.body.appendChild(
    bindDOM(
        `
    <div>
      <script>
        function get(path) {
          loading = true;
          let result = fetch(path);
          loading = false;
          return result;
        }
        </script>
      <p if="loading">Loading...</p>
      <ul>
        <li for="let post of get(page).data.children" bind>post.data.title</li>
      </ul>
    </div>`,
        console.log,
        console.error,
        {
            page: "https://www.reddit.com/r/programming.json"
            loading: false,
            fetch: metaFetch
        }
    )
);
```

Here we reach out for HTTP resource and indicatie in UI loading state. `get` is synchronous in context of application code, but asynchronous for browser.

### `script` tag and `script` attribute

`<script>` evaluates in similar way to native `<script>`. Currently only inline scripts are supported, no `src` attribute support, no `async`/`defer`/`type`.

It supports `observe` attibute though, which will make this tag body to reevaluate when any automatically observed variables change.

`<script>` doesn't have to be added to `Document` to be evaluated, it is evaluated immediately.

`<script>` will not create additional environment:

```js
const environment = {};
bindDOM(`<script>var foo='bar'</script>`, console.log, console.error, environment);
console.log(environment.foo); // bar
```

`script` attribute will make code contained in this attribute to evaluate in a context where `this` is bound to owning element:

```js
bindDOM(`<textarea script="initTextarea(this)></textarea>`, console.log, console.error, {
    initTextarea(element) {
        // do some logic HTMLTexareaElement element
    }
});
```

`script` attribute _will_ create additional environment:

```js
const environment = {};
bindDOM(`<div script="var foo='bar'"></div>`, console.log, console.error, environment);
console.log(environment.foo); // undefined
```

Browser does the same thing natively.

### `if` attribute

`if` evaluates attribute contents to a value, if value is truthy, descendant nodes will be bound by Vanillin. Otherwise they will be removed. Variables are observed, so when falsy condition becomes truthy, descendants will be appended to element with `if` attribute again:

```html
<script>
    var condition,
        runs = 0;
</script>
<div bind>"Runs: "+runs</div>
<label><input type="checkbox" onchange="condition=this.checked" /> Condition</label> <br />
<div if="condition">
    <span>Checkbox is checked</span>
    <script>
        console.log("it's run each time");
        // support for observing update expression (runs++) is not supported yet.
        runs = runs + 1;
    </script>
</div>
```

`else` or `else-if` attribute is not implemented yet.

In case of adding it into DOM, remember that browser will execute all scripts regularly. In this example it's not a problem, because we use no implicit variables passed as environment. It'll create variables in browsers' `window`. To mitigate it change `<script>`'s `type` attribute to anything but `text/javascript`. It can be `text/metaes` and browser won't run it.

### `for` attribute

`for` attribute currently supports only `ForOfStatement`. For other types of loops there will be thrown an error. `for` attribute supports `ForOfStatement` to the degree MetaES supports it. Additionally, there's possibility to use `bind` function in for loop header for better performance. Thanks to `bind` Vanillin will know which variable represents array to iterate over and react when elements are added or removed.

Example:

```html
<ul for="let i of Array.from({length:10}).map((_,i)=>i)">
    <li bind>"item" + i</li>
</ul>
```

it will render list of 10 elements.

When using `bind`:

```html
<script>
    let anArray = [1, 2, 3];
</script>
<ul for="let i of bind(anArray)">
    <li bind>"item" + i</li>
</ul>
```

only modified `<li>` elements will be added or removed. Withoud `bind`, for every change in right-hand side or `ForOfStatement`, all elements will be rerendered.

#### `bind` usage examples

TBD.

### `switch`, `try/catch`

Not implemented yet.

### Components (functions)

Components in Vanillin are a little bit like WebComponents, but only on the surface. Actually they are more like functions in JavaScript.

Let's define one:

```html
<function name="panel">
    <h2>A panel</h2>
    <p>Hello world</p>
</function>
```

Component definition is similar to function definition - in ECMAScript it's called `Function Declaration`, because it's a statement, not expression. `name` attribute is required here, otherwise Vanillin will throw.
Without `name` it would be a component expression (`Function Expression` in ECMAScript), but it would be non-idiomatic in Vanillin (in HTML) to be run as [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE). Therefore it's disallowed.

Element's name - `function` - was chosen deliberately to resemble ECMAScript.

Let's use it:

```html
<panel></panel>
```

You can also use `bind-component`:

```html
<div bind-component="panel"></div>
```

`bind-component` may be useful, it will allow to avoid non-standard HTML elements (like `panel`) which in some cases may be hoisted up the tree by browser and break your design.

For example, this:

```html
<table>
    <thead>
        <foo></foo>
    </thead>
</table>
```

will be transformed into:

```html
<foo></foo>
<table>
    <thead></thead>
</table>
```

Calling/creating component will clone descendants of component definition, add them to `<panel>` HTML element and will run `bindDOM` on them with appropriate environment.

Components are not first class, meaning they cannot be referenced in code. You can't write:

```js
const panel = new Panel();
panel1.x = y;
```

This is WebComponents' style.

What else makes Vanillin components similar to JavaScript functions:

-   they support parameters:

    ```html
    <function name="panel" title="'Untitled'" contents>
        <h2 bind>title</h2>
        <p bind>contents</p>
    </function>
    ```

    Parameters modify environment used for binding components body. They are like variable declarations, declaration and usage order doesn't matter. It differs from JavaScript functions where parameters order matters, but in HTML world certain attributes order should not be required.

-   they support closures

    ```html
    <script>
        var componentsCounter = 0;
    </script>
    <p>How many components were created? <strong bind>componentsCounter</strong></p>
    <function name="panel" title="'Untitled'">
        <script>
            componentsCounter = componentsCounter + 1;
        </script>
        <div bind>title</div>
    </function>
    <panel></panel> <panel title="'Panel1'"></panel> <panel title="document.title"></panel>
    <span bind-component="panel" title="'Run component with attribute'"></span>
    ```

    `<strong>` will display `4`.

    Components also can be part of closure:

    ```html
    <function name="menu-item" text> <span bind>text</span> </function>
    <function name="menu" items="[]"> <menu-item for="let item of items" text="item"></menu-item> </function>
    <menu items="['Home', 'Contact', 'About']"></menu>
    ```

-   they can be nested:

    ```html
    <function name="menu" items="[]">
        <function name="menu-item" text> <span bind>text</span> </function>
        <menu-item for="let item of items" text="item"></menu-item>
    </function>
    <menu items="['Home', 'Contact', 'About']"></menu>
    ```

-   scoping works properly:

    ```html
    <function name="outer"> <function name="inner">Hello!</function> </function>

    <!-- can see "Hello!" -->
    <outer></outer>

    <!-- can't see "Hello!" -->
    <inner></inner>
    ```

On the other hand, Vanillin components do not:

-   `return` values,
-   inherit from `Function` object, no `bind`, `apply` etc. support.

Nonetheless, these features could be implemented, currently they are not.

We have discussed inline HTML component definitions. Let's switch to programmatic usage.

`defineComponent` example:

```javascript
const components = { values: {} };
defineComponent(components, "user-profile", null, {
    templateString: "<div bind>userName</div>"
});
document.body.appendChild(
    bindDOM(
        `<user-profile></user-profile>`,
        console.log,
        console.error,
        { userName: "User1" },
        { interpreters: components }
    )
);
```

`bindDOM` looks like `metaesEval`. That's one of the design goals.

In the example Vanillin will throw `ReferenceError: "userName" is not defined.`.

Explanation: `user-profile` should be seen as a function, and functions in JavaScript and MetaES support only static reference binding. `<div bind>userName</div>` is a moment of defining a function, and in its surrounding scopes `userName` is not available.

Note: `const components = { values: {} }` is MetaES environment.

We can fix `ReferenceError` in couple of ways:

1. Pass `userName` as component argument:

    ```javascript
    const components = { values: {} };
    defineComponent(components, "user-profile", null, {
        templateString: "<function username><div bind>username</div></function>"
    });
    document.body.appendChild(
        bindDOM(
            `<user-profile userName="userName"></user-profile>`,
            console.log,
            console.error,
            { userName: "User1" },
            { interpreters: components }
        )
    );
    ```

    Note how we could use `<function>` tag without `name` attribute. In this context `Function Expression` (component expression) is fine, because `templateString` is expected to be evaluated to a value. We also had to use lowercase attribute name. A quote form [W3C spec](https://www.w3.org/TR/html5/dom.html#embedding-custom-non-visible-data-with-the-data-attributes):

    > All attribute names on HTML elements in HTML documents get ASCII-lowercased automatically, so the restriction on ASCII uppercase letters doesn’t affect such documents.

    This will be handled by automatic translation betteen camel cased and hypen separated identifiers. The same way as CSS properties are translated between CSS language and DOM JavaScript property names. You'll be able to write `<function user-name>` and use `userName` inside.

2. Modify _creation_ time function context:

    ```javascript
    const components = { values: {} };
    defineComponent(components, "user-profile", () => ({ environment: { userName: "User1" } }), {
        templateString: "<div bind>userName</div>"
    });
    document.body.appendChild(
        bindDOM(
            `<user-profile></user-profile>`,
            console.log,
            console.error,
            { userName: "User1" },
            { interpreters: components }
        )
    );
    ```

    This 3rd argument that was previously `null` became a function returning and object with `environment` field. This is how the type definition of that returned object looks like:

    ```typescript
    type ComponentConstructorResult = {
        environment?: { [key: string]: any };
        onbind?: () => void;
        onunbind?: () => void;
    };
    ```

    `environment` - shortcut object-based environment which Vanillin (MetaES) will convert to full environment internally. `onbind` and `onunbind` will be covered later, but it's sufficent to say they're optional events handlers called when Vanillin reaches component during `bindDOM` phase or `unbindDOM` phase. `unbindDOM` support is not implemented yet.

    This 3rd argument is a [_component constructor_](./docs-vanillin.html#component-constructor).

3. Create _closure_ by hand (_closure_ is MetaES' environment):

    ```javascript
    const components = { values: {} };
    defineComponent(components, "user-profile", null, {
        templateString: "<div bind>userName</div>",
        closure: { values: { userName: "User1" } }
    });
    document.body.appendChild(
        bindDOM(
            `<user-profile></user-profile>`,
            console.log,
            console.error,
            { userName: "User1" },
            { interpreters: components }
        )
    );
    ```

    That's convenient when you don't want to use constructor and don't use inline HTML component definition.

#### Component constructor

Think of component constructor as a JavaScript function used as a constructor. In pre-ES6 times when we had no `class` keyword, objects were created with functions with attached prototype chains. Then they were run with `new` or `Object.create`.

Components constructors in Vanillin follow that pattern. However, you don't execute `new` or call `Object.create` manually, Vanillin does it for you during `bindDOM`. Let's go through all possible ways of defining constructor for `<user-profile>` component:

1. Function constructor returning result:

    You could have encountered subtle difference when using function as constructors in JavaScript:

    ```javascript
    function User() {
        this.name = "user1";
    }
    new User().name; // 'user1';
    ```

    but:

    ```javascript
    function User() {
        this.name = "user1";
        return {};
    }
    new User().name; // 'undefined';
    ```

    Vanillin doesn't follow this mechanism exactly, but uses value returned by constructor to modify environment for children DOM elements:

    ```javascript
    function UserProfile() {
        const environment = { firstName: "user", lastName: "number1" };
        return { environment };
    }
    defineComponent(components, "user-profile", UserProfile, {
        templateString: "<div><span bind>firstName + ' ' + lastName</span></div>"
    });
    ```

    This will display full user data.

2. Function constructor returning promise with constructor:

    It may sound a bit confusing, but it's _import pattern_.
    That's useful for lazy component definition loading.

    See first:

    ```javascript
    function UserProfile() {
        const environment = { firstName: "user", lastName: "number1" };
        return { environment };
    }
    defineComponent(components, "user-profile", () => Promise.resolve(UserProfile), {
        templateString: "<div><span bind>firstName + ' ' + lastName</span></div>"
    });
    ```

    Not looking useful, but:

    ```javascript
    defineComponent(components, "user-profile", import("./user-profile.js"), {
        templateString: "<div><span bind>firstName + ' ' + lastName</span></div>"
    });
    ```

    does.

    Vanillin provides `load` function that does exactly that: loads module under given path and takes default export treating it as a constructor. This is how `user-profile.js` could look like:

    ```javascript
    export default function UserProfile() {
        const environment = { firstName: "user", lastName: "number1" };
        return { environment };
    }
    ```

    Now switch `import` to Vanillin's `load` and use `templateUrl` instead of `templateString`:

    ```javascript
    defineComponent(components, "user-profile", load("./user-profile.js"), {
        templateUrl: "./user-profile.html"
    });
    ```

    Vanillin will load both template and constructor before continues evaluation.

    Please note that currently ES Modules are not supported in `load` function, you have to transpile code to CommonJS style:

    ```javascript
    exports.default = function UserProfile() {
        const environment = { firstName: "user", lastName: "number1" };
        return { environment };
    };
    ```

    Vanillin will simply unpack Promise, take its result and treat as a constructor again.

    `load` is a simple AMD loading pattern - without dependencies. It you want dependencies in your constructor file, use other module loader like Require.js or webpack packager. Only thing Vanillin wants is a Promise resolving to a constructor.

#### Component slots

Slots are useful for inserting custom content in a certain place inside component. This could be done using `element.appendChild`, but this pattern is common enough to introduce more user friendly way:

```javascript
const components = { values: {} };
defineComponent(components, "panel", null, {
    templateString: `
      <function title="'Untitled'">
          <h3 bind>title</h3>
          <div slot></div>
      </function>`,
    slotSelector: "[slot]"
});
document.body.appendChild(
    bindDOM(
        `<panel title="'Panel1'"><p>Lorem ipsum</p></panel>`,
        console.log,
        console.error,
        { userName: "User1" },
        { interpreters: components }
    )
);
```

`slotSelector` is a CSS selector.

#### Component constructor arguments

Let's go through an example:

```javascript
// [3]
function Panel(/* [4] */ element, /* [2] */ children) {
    // [1]
    const slot = element.querySelector("[slot]");
    children.forEach(child => slot.appendChild(child));
    element.querySelector("[data-name]").innerHTML = "<span>Hello world</span>";
}
const components = { values: {} };
defineComponent(components, "panel", Panel, {
    templateString: `
      <function title="'Untitled'">
          <h3 bind>title</h3>
          <div data-name="content"></div>
          <div slot></div>
      </function>`
});
document.body.appendChild(
    bindDOM(
        `<panel title="'Panel1'"><p>Lorem ipsum</p></panel>`,
        console.log,
        console.error,
        { userName: "User1" },
        { interpreters: components }
    )
);
```

Explanation:

-   We didn't use `slotSelector`. We've implemented it manually in place `[1]`,
-   `children` parameter in `[2]` is bound to array of DOM elements passed as children of `<panel>` instance,
-   `Panel` constructor (`[3]`) didn't return anything - it's not required,
-   `[4]` is component's template. It's cloned DOM element built by `DOMParser` from `templateString`.

Let's create something more complex:

```javascript
function Panel(element, children, env) {
    console.log(env); // [2]
    const slot = element.querySelector("[slot]");
    // [3]
    children.forEach(child => slot.appendChild(child));
    element.querySelector("[data-name]").innerHTML = "<span>Hello world</span>";
}
const components = { values: {} };
defineComponent(components, "panel", Panel, {
    templateString: `
      <function title="'Untitled'">
          <h3 bind>title</h3>
          <div data-name="content"></div>
          <div slot></div>
      </function>`
});
document.body.appendChild(
    bindDOM(
        `<div>
            <script>var message = "All ok";</script>
            <panel title="'Panel1'">
                <p>Lorem ipsum</p>
                <!-- [1] -->
                <p bind>message</p>
            </panel>
        </div>`,
        console.log,
        console.error,
        { userName: "User1" },
        { interpreters: components }
    )
);
```

Result: `ReferenceError: "message" is not defined` at `<p>` element location.

Explanation:

-   At `[1]` we tried to use closure, but it failed, this _should_ work like in JavaScript,
-   We logged 3rd constructor argument, which is MetaES environment relating to component call arguments (function call arguments). It doesn't contain `message` variable, because it's like:

    ```javascript
    function getPanelConstructor() {
        return function Panel() {
            message; // ReferenceError
        };
    }
    (function() {
        const panel = getPanelConstructor();
        const message = "All ok";
        // create panel instance
        panel();
    })();
    ```

3. In component constructor at `[3]` we've immediately appended children to the component template. Here lies the key: we shouldn't do that that early, because children elements become part of _template_. And template **can't** see surrouding scope of `<panel>`, because `<panel>` is like a function call it supports only static variable binding.
4. If not _that early_, then when?

Let's see:

```javascript
function Panel(element, children, env) {
    const slot = element.querySelector("[slot]");
    return {
        onbind() {
            children.forEach(child => slot.appendChild(child));
        }
    };
}
```

In `onbind` event handler. Now everything works properly.

Simple rule to remember: `onbind` is called at the very end after `bindDOM` was called on both template of component and passed in children nodes. `bindDOM` may take unpredictable time, because template and children nodes may load new components recursively, do something asynchronous etc. `onbind` waits.

#### Children to parent component communication

It's a common pattern where descendant components bubble up events of simply pass some data to surrounding component. Because Vanillin operates on DOM, you can always dispatch `CustomEvent` and catch it inside wrapping component logic. That will work, but there are better ways.

Let's focus on example modal alert component:

```javascript
function Alert(element) {
    function close() {
        element.parentNode.removeChild(element);
    }
    return {
        environment: { close }
    };
}
const components = { values: {} };
defineComponent(components, "alert", Alert, {
    slotSelector: "[slot]",
    templateString: `
    <div>
      <h2>Information</h2>
      <div slot></div>
    </div>
  `
});
document.body.appendChild(
    bindDOM(
        `<alert closure="{close}">
          <p>Ok got it. <button onclick="close()">Close</button></p>
        </alert>`,
        console.log,
        console.error,
        {},
        { interpreters: components }
    )
);
```

There's only one thing that is new: `closure` attribute. `closure` evaluates to an object, that object will be added to children's environment. When `closure` is evaluated, it has access to `environment` defined by component.

It is an explicit way of passing values from component constructor result environment to component children environment. If there was no `closure` attribute functionality, only component's template would see component's environment, which would be too limiting.

`closure` will cause error if you try to extract something that doesn't exist in component's environment: `closure="{close, foo}"` will throw. `closure` sees whole component's closure.

### Extending Vanillin

TBD.

<<include:includes/docs-imports.html>>
