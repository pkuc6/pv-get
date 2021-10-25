"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveLessons = exports.lessons = exports.config = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
[
    '../archive/',
    '../info/',
    '../info/lessons/',
    '../info/courses/'
].map(val => (0, path_1.join)(__dirname, val)).forEach(val => {
    if (!(0, fs_1.existsSync)(val)) {
        (0, fs_1.mkdirSync)(val);
    }
});
exports.config = {
    collectOldCourses: false,
    downloadFirmVideoProxy: 'http://host',
    downloadSegmentErrLimit: 100,
    downloadSegmentProxy: 'http://host',
    downloadSegmentThreads: 2,
    downloadSegmentTimeout: 10,
    downloadVideoTimeout: 600,
    errSleep: 5,
    ignoreCourses: [18049],
    keyServerPort: 39789,
    requestErrLimit: 10,
    requestTimeout: 10,
    useFirmURL: false,
    users: [{
            studentId: '1*000*****',
            password: '********',
        }]
};
exports.lessons = [];
const path0 = (0, path_1.join)(__dirname, '../config.json');
const path1 = (0, path_1.join)(__dirname, '../lessons.json');
function saveLessons() {
    (0, fs_1.writeFileSync)(path1, JSON.stringify(exports.lessons, undefined, 4));
}
exports.saveLessons = saveLessons;
if (!(0, fs_1.existsSync)(path0)) {
    (0, fs_1.writeFileSync)(path0, JSON.stringify(exports.config, undefined, 4));
}
else {
    Object.assign(exports.config, JSON.parse((0, fs_1.readFileSync)(path0, { encoding: 'utf8' })));
}
if (!(0, fs_1.existsSync)(path1)) {
    saveLessons();
}
else {
    exports.lessons.push(...JSON.parse((0, fs_1.readFileSync)(path1, { encoding: 'utf8' })));
}
