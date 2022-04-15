import {existsSync, mkdirSync, writeFileSync, readFileSync} from 'fs'
import {join} from 'path'
[
    '../archive/',
    '../info/',
    '../info/lessons/',
    '../info/courses/'
].map(val => join(__dirname, val)).forEach(val => {
    if (!existsSync(val)) {
        mkdirSync(val)
    }
})
export const config = {
    archiveDir: 'archive',
    allowUnauthorized: true,
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
    users: [{
        studentId: '1*000*****',
        password: '********'
    }]
}
export interface Lesson {
    url: string
    courseFolder: string
    lessonName: string
}
export const lessons: Lesson[] = []
const path0 = join(__dirname, '../config.json')
const path1 = join(__dirname, '../lessons.json')
export function saveLessons() {
    writeFileSync(path1, JSON.stringify(lessons, undefined, 4))
}
if (!existsSync(path0)) {
    writeFileSync(path0, JSON.stringify(config, undefined, 4))
} else {
    Object.assign(config, JSON.parse(readFileSync(path0, {encoding: 'utf8'})))
}
if (!existsSync(path1)) {
    saveLessons()
} else {
    lessons.push(...JSON.parse(readFileSync(path1, {encoding: 'utf8'})))
}