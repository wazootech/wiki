"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WikiSetupError = exports.WikiCommandError = exports.Wiki = void 0;
var wiki_1 = require("./wiki");
Object.defineProperty(exports, "Wiki", { enumerable: true, get: function () { return wiki_1.Wiki; } });
var errors_1 = require("./errors");
Object.defineProperty(exports, "WikiCommandError", { enumerable: true, get: function () { return errors_1.WikiCommandError; } });
Object.defineProperty(exports, "WikiSetupError", { enumerable: true, get: function () { return errors_1.WikiSetupError; } });
