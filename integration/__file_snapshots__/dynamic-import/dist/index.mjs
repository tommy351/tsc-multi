"use strict";
(async () => {
    const { print } = await import("./print.mjs");
    print("Dynamic");
})();
