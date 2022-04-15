"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.download = exports.collect = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
const ip = require("ip");
const init_1 = require("./init");
const cli_tools_1 = require("@ddu6/cli-tools");
const process_1 = require("process");
const clit = new cli_tools_1.CLIT(__dirname, init_1.config);
const address = ip.address();
async function get(url, params, cookie = '', referer = '') {
    for (let i = 0; i < init_1.config.requestErrLimit; i++) {
        const result = await clit.request(url, {
            params,
            cookie,
            referer
        });
        if (typeof result !== 'number') {
            return result;
        }
        clit.out(result);
        await clit.sleep(init_1.config.errSleep);
    }
    throw new Error(`Fail to get ${url}`);
}
async function post(url, form, cookie = '', referer = '') {
    for (let i = 0; i < init_1.config.requestErrLimit; i++) {
        const result = await clit.request(url, {
            form,
            cookie,
            referer
        });
        if (typeof result !== 'number') {
            return result;
        }
        clit.out(result);
        await clit.sleep(init_1.config.errSleep);
    }
    throw new Error(`Fail to post ${url}`);
}
async function getLoginCookie(studentId, password, appId, appName, redirectURL) {
    const { cookie } = await get('https://iaaa.pku.edu.cn/iaaa/oauth.jsp', {
        appID: appId,
        appName: appName,
        redirectUrl: redirectURL
    });
    const { body } = await post('https://iaaa.pku.edu.cn/iaaa/oauthlogin.do', {
        appid: appId,
        userName: studentId,
        password,
        randCode: '',
        smsCode: '',
        otpCode: '',
        redirUrl: redirectURL
    }, `remember=true; userName=${studentId}; ${cookie}`, 'https://iaaa.pku.edu.cn/iaaa/oauth.jsp');
    const { token } = JSON.parse(body);
    if (typeof token !== 'string') {
        throw new Error(`Fail to get login cookie of app ${appId}`);
    }
    return (await get(redirectURL, {
        _rand: Math.random().toString(),
        token
    })).cookie;
}
async function getBlackboardSession(studentId, password) {
    const match = (await getLoginCookie(studentId, password, 'blackboard', '1', 'https://course.pku.edu.cn/webapps/bb-sso-bb_bb60/execute/authValidate/campusLogin'))
        .match(/s_session_id=([^;]{8,}?)(?:;|$)/);
    if (match === null) {
        throw new Error(`Fail to get blackboard session of user ${studentId}`);
    }
    return match[1];
}
async function getHQYToken(studentId, password) {
    const { body } = await post('https://portal.pku.edu.cn/portal2017/account/getBasicInfo.do', undefined, await getLoginCookie(studentId, password, 'portal2017', '北京大学校内信息门户新版', 'https://portal.pku.edu.cn/portal2017/ssoLogin.do'));
    const { name } = JSON.parse(body);
    if (typeof name !== 'string') {
        throw new Error(`Fail to get hqy token of user ${studentId}`);
    }
    const match = (await get('https://passportnewhqy.pku.edu.cn/index.php', {
        r: 'auth/login',
        tenant_code: '1',
        auType: 'account',
        name: name,
        account: studentId
    }))
        .cookie
        .match(/_token=([^;]{16,}?)(?:;|$)/);
    if (match === null) {
        throw new Error(`Fail to get hqy token of user ${studentId}`);
    }
    return match[1];
}
async function getCourseIds(blackboardSession) {
    let body = '';
    if (init_1.config.collectOldCourses) {
        body += (await get('https://course.pku.edu.cn/webapps/portal/execute/tabs/tabAction', {
            action: 'refreshAjaxModule',
            modId: '_978_1',
            tabId: '_1_1'
        }, `s_session_id=${blackboardSession}`)).body;
    }
    try {
        body += (await get('https://course.pku.edu.cn/webapps/portal/execute/tabs/tabAction', {
            action: 'refreshAjaxModule',
            modId: '_977_1',
            tabId: '_1_1'
        }, `s_session_id=${blackboardSession}`)).body;
    }
    catch (err) {
        if (err instanceof Error) {
            clit.out(err);
        }
    }
    const ids = [];
    for (const [, id] of body.matchAll(/key=_(\d+)/g)) {
        if (!init_1.config.ignoreCourses.includes(Number(id))) {
            ids.push(id);
        }
    }
    return ids;
}
async function getLessonIds(blackboardSession, courseId, courseFolder) {
    const { body } = await get('https://course.pku.edu.cn/webapps/bb-streammedia-hqy-bb_bb60/videoList.action', {
        course_id: `_${courseId}_1`
    }, `s_session_id=${blackboardSession}`);
    (0, fs_1.writeFileSync)((0, path_1.join)(__dirname, `../info/courses/${cli_tools_1.CLIT.getDate()}-${cli_tools_1.CLIT.getTime().replace(/:/g, '-')} ${courseId}.html`), body);
    const match = body.match(/hqyCourseId=(\d+)/);
    if (match === null) {
        return [];
    }
    const hqyCourseId = match[1];
    const ids = [];
    for (const [, name, subId] of body.matchAll(/(\d{4}-\d{2}-\d{2}第\d+-\d+节)[\s\S]+?hqySubId=(\d+)/g)) {
        if (init_1.lessons.some(val => val.courseFolder === courseFolder && val.lessonName === name)
            || courseFolder.length > 0 && (0, fs_1.existsSync)((0, path_1.join)(__dirname, '..', init_1.config.archiveDir, `${courseFolder}/${name}.mp4`))) {
            continue;
        }
        ids.push(`${hqyCourseId}-${subId}`);
    }
    return ids;
}
async function getLessonInfo(hqyToken, lessonId, courseId, courseFolder) {
    const cookie = `_token=${hqyToken}`;
    const [hqyCourseId, hqySubId] = lessonId.split('-');
    const { body } = await get('https://livingroomhqy.pku.edu.cn/courseapi/v2/schedule/search-live-course-list', {
        all: '1',
        course_id: hqyCourseId,
        sub_id: hqySubId,
        with_sub_data: '1'
    }, cookie);
    (0, fs_1.writeFileSync)((0, path_1.join)(__dirname, `../info/lessons/${cli_tools_1.CLIT.getDate()}-${cli_tools_1.CLIT.getTime().replace(/:/g, '-')} ${lessonId}.json`), body);
    const list = JSON.parse(body).list;
    if (list.length === 0) {
        return;
    }
    const { title: courseName, sub_title: lessonName, sub_content: sub, realname: teacher } = list[0];
    const { save_playback: { contents: surl } } = JSON.parse(sub);
    let url;
    if (Array.isArray(surl)) {
        const result = surl.find(value => Number(value.resolution.slice(0, 4)) >= 1080
            && !value.preview.includes('expire='));
        if (result !== undefined) {
            const purl = result.preview;
            if (typeof purl === 'string') {
                url = purl;
            }
        }
    }
    else if (typeof surl === 'string' && surl.endsWith('.mp4')) {
        url = surl;
    }
    if (url === undefined) {
        clit.out(`Fail to get info of ${courseName} ${lessonName}`);
        return;
    }
    const [, year, month] = (lessonName.match(/^(\d+)-(\d+)/) ?? [, 0, 0]).map(Number);
    let term = 'Fall';
    if (month === 7 || month === 8) {
        term = 'Summer';
    }
    else if (month < 7 && month > 1) {
        term = 'Spring';
    }
    if (courseFolder.length === 0) {
        courseFolder = `${courseName} (${year} ${term} ${teacher}) ${courseId}`;
        (0, fs_1.mkdirSync)((0, path_1.join)(__dirname, '..', init_1.config.archiveDir, `${courseFolder}/`));
    }
    const info = {
        url,
        courseFolder,
        lessonName,
    };
    if (url.endsWith('.m3u8')) {
        const path = (0, path_1.join)(__dirname, '..', init_1.config.archiveDir, `${courseFolder}/${lessonName}.m3u8`);
        if (!(0, fs_1.existsSync)(path)) {
            const { body } = await get(url);
            const match = body.match(/URI="(.+)"/);
            if (match !== null) {
                const key = (await get(match[1], undefined, cookie)).body;
                if (key.length === 16) {
                    (0, fs_1.writeFileSync)(path, body
                        .replace(/URI=".+"/, `URI="https://vk.pku6.workers.dev/${key}"`)
                        .replace(/segment_/g, new URL('segment_', url).href));
                    clit.out(`${path} created`);
                }
            }
        }
    }
    clit.out(`Get info of ${courseName} ${lessonName}`);
    return info;
}
async function collect() {
    const courseFolders = (0, fs_1.readdirSync)((0, path_1.join)(__dirname, '..', init_1.config.archiveDir, '/'));
    const ids = courseFolders.map(val => val.replace(/^.*?(?=\d*$)/, ''));
    const courseIdSet = {};
    for (const { studentId, password } of init_1.config.users) {
        const session = await getBlackboardSession(studentId, password);
        const token = await getHQYToken(studentId, password);
        for (const id of await getCourseIds(session)) {
            if (courseIdSet[id]) {
                continue;
            }
            courseIdSet[id] = true;
            let courseFolder = courseFolders[ids.indexOf(id)] ?? '';
            const lessonIds = await getLessonIds(session, id, courseFolder);
            for (const lessonId of lessonIds) {
                const info = await getLessonInfo(token, lessonId, id, courseFolder);
                if (info === undefined) {
                    break;
                }
                if (courseFolder.length === 0) {
                    courseFolder = info.courseFolder;
                }
                init_1.lessons.push(info);
                (0, init_1.saveLessons)();
            }
        }
    }
    clit.out('Finished');
}
exports.collect = collect;
async function downloadSegments(localDir, remoteDir, ids) {
    const total = ids.length;
    let count = 0;
    clit.out(`${total} segments will be downloaded to ${localDir}`);
    for (let i = 0; i <= init_1.config.downloadSegmentErrLimit; i++) {
        const newIds = [];
        let promises = [];
        for (const id of ids) {
            promises.push((async () => {
                const path = (0, path_1.join)(localDir, id + '.ts');
                if (!(0, fs_1.existsSync)(path)) {
                    if (await clit.download(new URL(`segment_${id}.ts`, remoteDir).href, path, {
                        referer: 'https://livingroomhqy.pku.edu.cn/',
                        requestTimeout: init_1.config.downloadSegmentTimeout,
                        proxy: init_1.config.downloadSegmentProxy
                    }) !== 200) {
                        newIds.push(id);
                        return;
                    }
                }
                count++;
                process_1.stdout.write(`\r${(count / total * 100).toFixed(3)}%`);
            })());
            if (promises.length >= init_1.config.downloadSegmentThreads) {
                await Promise.all(promises);
                promises = [];
            }
        }
        await Promise.all(promises);
        if (newIds.length === 0) {
            break;
        }
        ids = newIds;
    }
    process_1.stdout.write('\r        \n');
    if (count === total) {
        return 200;
    }
    return 500;
}
async function convertVideo(path, newPath) {
    return await new Promise((resolve) => {
        const subProcess = (0, child_process_1.spawn)('ffmpeg', ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy', '-i', path, '-movflags', 'faststart', '-c', 'copy', newPath], {
            stdio: 'inherit'
        });
        subProcess.addListener('exit', code => {
            resolve(code ?? 1);
        });
        subProcess.addListener('error', err => {
            subProcess.kill();
            clit.out(err);
            resolve(1);
        });
    });
}
function rm(path) {
    if (!(0, fs_1.existsSync)(path)) {
        return;
    }
    if (!(0, fs_1.statSync)(path).isDirectory()) {
        (0, fs_1.unlinkSync)(path);
        return;
    }
    for (const file of (0, fs_1.readdirSync)(path)) {
        rm((0, path_1.join)(path, file));
    }
    (0, fs_1.rmdirSync)(path);
}
async function download() {
    while (true) {
        const lesson = init_1.lessons.pop();
        if (lesson === undefined) {
            break;
        }
        const { url, courseFolder, lessonName } = lesson;
        const path = (0, path_1.join)(__dirname, '..', init_1.config.archiveDir, `${courseFolder}/${lessonName}.mp4`);
        if ((0, fs_1.existsSync)(path)) {
            (0, init_1.saveLessons)();
            continue;
        }
        if (url.endsWith('.m3u8')) {
            const m3u8Path = (0, path_1.join)(__dirname, '..', init_1.config.archiveDir, `${courseFolder}/${lessonName}.m3u8`);
            if (!(0, fs_1.existsSync)(m3u8Path)) {
                (0, init_1.saveLessons)();
                continue;
            }
            let remoteDir = '';
            const ids = [];
            const string = (0, fs_1.readFileSync)(m3u8Path, { encoding: 'utf8' })
                .replace(/URI=".+\/(.+)"/, `URI="http://${address}:${init_1.config.keyServerPort}/$1"`)
                .replace(/\n(.+)segment_(\d+).ts/g, (_, dir, id) => {
                remoteDir = dir;
                ids.push(Number(id));
                return `\n${id}.ts`;
            });
            if (remoteDir.length === 0 || ids.length === 0) {
                init_1.lessons.unshift(lesson);
                (0, init_1.saveLessons)();
                clit.out(`Fail to convert ${m3u8Path}`);
                await clit.sleep(init_1.config.errSleep);
                continue;
            }
            const tmpDir = (0, path_1.join)(__dirname, '..', init_1.config.archiveDir, `${courseFolder}/tmp/`);
            const tmpPath = (0, path_1.join)(tmpDir, 'tmp.m3u8');
            if (!(0, fs_1.existsSync)(tmpDir)) {
                (0, fs_1.mkdirSync)(tmpDir);
            }
            if (await downloadSegments(tmpDir, remoteDir, ids) !== 200) {
                init_1.lessons.unshift(lesson);
                (0, init_1.saveLessons)();
                clit.out(`Fail to convert ${m3u8Path}`);
                await clit.sleep(init_1.config.errSleep);
                continue;
            }
            (0, fs_1.writeFileSync)(tmpPath, string);
            if (await convertVideo(tmpPath, path) === 0) {
                (0, init_1.saveLessons)();
                rm(tmpDir);
                clit.out(`${m3u8Path} converted`);
                continue;
            }
            init_1.lessons.unshift(lesson);
            (0, init_1.saveLessons)();
            clit.out(`Fail to convert ${m3u8Path}`);
            if ((0, fs_1.existsSync)(path)) {
                (0, fs_1.unlinkSync)(path);
            }
            await clit.sleep(init_1.config.errSleep);
            continue;
        }
        const result = await clit.download(url, path, {
            referer: 'https://livingroomhqy.pku.edu.cn/',
            requestTimeout: init_1.config.downloadVideoTimeout,
            proxy: init_1.config.downloadFirmVideoProxy,
            verbose: true
        });
        if (result === 200) {
            (0, init_1.saveLessons)();
            clit.out(`${url} downloaded to ${path}`);
            continue;
        }
        init_1.lessons.unshift(lesson);
        (0, init_1.saveLessons)();
        clit.out(`${result}, fail to download ${url} to ${path}`);
        await clit.sleep(init_1.config.errSleep);
    }
    clit.out('Finished');
}
exports.download = download;
