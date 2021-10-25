"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const init_1 = require("./init");
(0, http_1.createServer)((req, res) => {
    res.end((req.url ?? '').slice(1));
}).listen(init_1.config.keyServerPort);
