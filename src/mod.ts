import type {OutgoingHttpHeaders} from 'http'
import {readFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync, readdirSync, rmdirSync, statSync} from 'fs'
import {join} from 'path'
import {spawn} from 'child_process'
import * as ip from 'ip'
import {archiveDir, config, Lesson, lessons, saveLessons} from './init'
import {CLIT} from '@ddu6/cli-tools'
import {stdout} from 'process'
const clit = new CLIT(__dirname, config)
const address = ip.address()
type Term = 'Fall' | 'Spring' | 'Summer'
async function get(url: string, params?: Record<string, string | number>, cookie = '', referer = '', headers: OutgoingHttpHeaders = {}) {
    for (let i = 0; i < config.requestErrLimit; i++) {
        const result = await clit.request(url, {
            params,
            cookie,
            referer,
            headers
        })
        if (typeof result !== 'number') {
            return result
        }
        clit.out(result)
        await clit.sleep(config.errSleep)
    }
    throw new Error(`Fail to get ${url}`)
}
async function post(url: string, form?: Record<string, string>, cookie = '', referer = '', headers: OutgoingHttpHeaders = {}) {
    for (let i = 0; i < config.requestErrLimit; i++) {
        const result = await clit.request(url, {
            form,
            cookie,
            referer,
            headers
        })
        if (typeof result !== 'number') {
            return result
        }
        clit.out(result)
        await clit.sleep(config.errSleep)
    }
    throw new Error(`Fail to post ${url}`)
}
async function getLoginCookie(studentId: string, password: string, appId: string, appName: string, redirectURL: string) {
    const {cookie} = await get('https://iaaa.pku.edu.cn/iaaa/oauth.jsp', {
        appID: appId,
        appName: appName,
        redirectUrl: redirectURL
    })
    const {body} = await post('https://iaaa.pku.edu.cn/iaaa/oauthlogin.do', {
        appid: appId,
        userName: studentId,
        password,
        randCode: '',
        smsCode: '',
        otpCode: '',
        redirUrl: redirectURL
    }, `remember=true; userName=${studentId}; ${cookie}`, 'https://iaaa.pku.edu.cn/iaaa/oauth.jsp')
    const {token} = JSON.parse(body)
    if (typeof token !== 'string') {
        throw new Error(`Fail to get login cookie of app ${appId}`)
    }
    return (await get(redirectURL, {
        _rand: Math.random().toString(),
        token
    })).cookie
}
async function getBlackboardCookie(studentId: string, password: string) {
    // const match = (await getLoginCookie(studentId, password, 'blackboard', '1', 'https://course.pku.edu.cn/webapps/bb-sso-bb_bb60/execute/authValidate/campusLogin'))
    //     .match(/s_session_id=([^;]{8,}?)(?:;|$)/)
    // if (match === null) {
    //     throw new Error(`Fail to get blackboard session of user ${studentId}`)
    // }
    // return match[1]
    return await getLoginCookie(studentId, password, 'blackboard', '1', 'https://course.pku.edu.cn/webapps/bb-sso-bb_bb60/execute/authValidate/campusLogin')
}
async function getHQYToken(studentId: string, name: string) {
    // const {body} = await post('https://portal.pku.edu.cn/portal2017/account/getBasicInfo.do', undefined, await getLoginCookie(studentId, password, 'portal2017', '北京大学校内信息门户新版', 'https://portal.pku.edu.cn/portal2017/ssoLogin.do'))
    // const {name} = JSON.parse(body)
    // if (typeof name !== 'string') {
    //     throw new Error(`Fail to get hqy token of user ${studentId}`)
    // }
    const match = (await get('https://passportnewhqy.pku.edu.cn/index.php', {
        r: 'auth/login',
        tenant_code: '1',
        auType: 'account',
        name,
        account: studentId
    }))
        .cookie
        .match(/_token=([^;]{16,}?)(?:;|$)/)
    if (match === null) {
        throw new Error(`Fail to get hqy token of user ${studentId}`)
    }
    return match[1]
}
async function getCourseIds(cookie: string) {
    let body = ''
    // if (config.collectOldCourses) {
    //     body += (await get('https://course.pku.edu.cn/webapps/portal/execute/tabs/tabAction', {
    //         action: 'refreshAjaxModule',
    //         modId: '_978_1',
    //         tabId: '_1_1'
    //     }, `s_session_id=${blackboardSession}`)).body
    // }
    try {
        body += (await get('https://course.pku.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_3_1', {
            // action: 'refreshAjaxModule',
            // modId: '_977_1',
            // tabId: '_1_1'
        }, cookie)).body
    } catch (err) {
        if (err instanceof Error) {
            clit.out(err)
        }
    }
    if (!config.collectOldCourses) {
        body = body.split('历史课程', 1)[0]
    }
    const ids: string[] = []
    for (const [, id] of body.matchAll(/key=_(\d+)/g)) {
        if (!config.ignoreCourses.includes(Number(id))) {
            ids.push(id)
        }
    }
    return ids
}
async function getLessonIds(cookie: string, courseId: string, courseFolder: string) {
    const {body} = await get('https://course.pku.edu.cn/webapps/bb-streammedia-hqy-bb_bb60/videoList.action', {
        course_id: `_${courseId}_1`
    }, cookie)
    writeFileSync(join(__dirname, `../info/courses/${CLIT.getDate()}-${CLIT.getTime().replace(/:/g, '-')} ${courseId}.html`), body)
    const match = body.match(/hqyCourseId=(\d+)/)
    if (match === null) {
        return []
    }
    const hqyCourseId = match[1]
    const ids: string[] = []
    for (const [, name, subId] of body.matchAll(/(\d{4}-\d{2}-\d{2}第\d+-\d+节)[\s\S]+?hqySubId=(\d+)/g)) {
        if (
            lessons.some(val => val.courseFolder === courseFolder && val.lessonName === name)
            || courseFolder.length > 0 && existsSync(join(archiveDir, `${courseFolder}/${name}.mp4`))
        ) {
            continue
        }
        ids.push(`${hqyCourseId}-${subId}`)
    }
    return ids
}
async function getLessonInfo(hqyToken: string, lessonId: string, courseId: string, courseFolder: string) {
    const cookie = `_token=${hqyToken}`
    const auth = `Bearer ${decodeURIComponent(hqyToken).split('"').slice(-2, -1).join('')}`
    const [hqyCourseId, hqySubId] = lessonId.split('-')
    await get('https://onlineroomse.pku.edu.cn/consoleapi/v2/user/group-user', undefined, cookie, 'https://onlineroomse.pku.edu.cn/', {
        Authority: 'yjapise.pku.edu.cn',
        Authorization: auth,
        Origin: 'https://onlineroomse.pku.edu.cn'
    })
    await get('https://onlineroomse.pku.edu.cn/userapi/v1/info', undefined, cookie, 'https://onlineroomse.pku.edu.cn/', {
        Authority: 'yjapise.pku.edu.cn',
        Authorization: auth,
        Origin: 'https://onlineroomse.pku.edu.cn'
    })
    await get('https://onlineroomse.pku.edu.cn/userapi/v1/user/role/back/permission', undefined, cookie, 'https://onlineroomse.pku.edu.cn/', {
        Authority: 'yjapise.pku.edu.cn',
        Authorization: auth,
        Origin: 'https://onlineroomse.pku.edu.cn'
    })
    const {body} = await get('https://yjapise.pku.edu.cn/courseapi/v2/schedule/search-live-course-list', {
        all: '1',
        course_id: hqyCourseId,
        sub_id: hqySubId,
        with_sub_data: '1'
    }, undefined, 'https://onlineroomse.pku.edu.cn/', {
        Authority: 'yjapise.pku.edu.cn',
        Authorization: auth,
        Origin: 'https://onlineroomse.pku.edu.cn'
    })
    writeFileSync(join(__dirname, `../info/lessons/${CLIT.getDate()}-${CLIT.getTime().replace(/:/g, '-')} ${lessonId}.json`), body)
    const list: {
        title: string,
        sub_title: string,
        sub_content: string,
        realname: string
    }[] | undefined = JSON.parse(body).list
    if (list === undefined || list.length === 0) {
        return
    }
    const {
        title: courseName,
        sub_title: lessonName,
        sub_content: sub,
        realname: teacher
    } = list[0]
    const {
        save_playback: {contents: surl}
    }: {
        firm_source: {contents: string},
        save_playback: {contents: unknown}
    } = JSON.parse(sub)
    let url: string | undefined
    if (Array.isArray(surl)) {
        const result = surl.find(
            value => Number(value.resolution.slice(0, 4)) >= 1080
                && !value.preview.includes('expire=')
        )
        if (result !== undefined) {
            const purl: unknown = result.preview
            if (typeof purl === 'string') {
                url = purl
            }
        }
    } else if (typeof surl === 'string' && surl.endsWith('.mp4')) {
        url = surl
    }
    if (url === undefined) {
        clit.out(`Fail to get info of ${courseName} ${lessonName}`)
        return
    }
    const [, year, month] = (lessonName.match(/^(\d+)-(\d+)/) ?? [, 0, 0]).map(Number)
    let term: Term = 'Fall'
    if (month === 7 || month === 8) {
        term = 'Summer'
    } else if (month < 7 && month > 1) {
        term = 'Spring'
    }
    if (courseFolder.length === 0) {
        courseFolder = `${courseName} (${year} ${term} ${teacher}) ${courseId}`
        mkdirSync(join(archiveDir, `${courseFolder}/`))
    }
    const info: Lesson = {
        url,
        courseFolder,
        lessonName,
    }
    if (url.endsWith('.m3u8')) {
        const path = join(archiveDir, `${courseFolder}/${lessonName}.m3u8`)
        if (!existsSync(path)) {
            const {body} = await get(url)
            const match = body.match(/URI="(.+)"/)
            if (match !== null) {
                const key = (await get(match[1], undefined, cookie)).body
                if (key.length === 16) {
                    writeFileSync(
                        path,
                        body
                            .replace(/URI=".+"/, `URI="https://vk.pku6.workers.dev/${key}"`)
                            .replace(/segment_/g, new URL('segment_', url).href)
                    )
                    clit.out(`${path} created`)
                }
            }
        }
    }
    clit.out(`Get info of ${courseName} ${lessonName}`)
    return info
}
export async function collect() {
    const courseFolders = readdirSync(archiveDir)
    const ids = courseFolders.map(val => val.replace(/^.*?(?=\d*$)/, ''))
    const courseIdSet: Record<string, true | undefined> = {}
    for (const {studentId, password, name} of config.users) {
        const cookie = await getBlackboardCookie(studentId, password)
        const token = await getHQYToken(studentId, name)
        for (const id of await getCourseIds(cookie)) {
            if (courseIdSet[id]) {
                continue
            }
            courseIdSet[id] = true
            let courseFolder = courseFolders[ids.indexOf(id)] ?? ''
            const lessonIds = await getLessonIds(cookie, id, courseFolder)
            for (const lessonId of lessonIds) {
                const info = await getLessonInfo(token, lessonId, id, courseFolder)
                if (info === undefined) {
                    // break
                    continue
                }
                if (courseFolder.length === 0) {
                    courseFolder = info.courseFolder
                }
                lessons.push(info)
                saveLessons()
            }
        }
    }
    clit.out('Finished')
}
async function downloadSegments(localDir: string, remoteDir: string, ids: number[]) {
    const total = ids.length
    let count = 0
    clit.out(`${total} segments will be downloaded to ${localDir}`)
    for (let i = 0; i <= config.downloadSegmentErrLimit; i++) {
        const newIds: number[] = []
        let promises: Promise<void>[] = []
        for (const id of ids) {
            promises.push((async () => {
                const path = join(localDir, id + '.ts')
                if (!existsSync(path)) {
                    if (await clit.download(new URL(`segment_${id}.ts`, remoteDir).href, path, {
                        referer: 'https://livingroomhqy.pku.edu.cn/',
                        requestTimeout: config.downloadSegmentTimeout,
                        proxy: config.downloadSegmentProxy
                    }) !== 200) {
                        newIds.push(id)
                        return
                    }
                }
                count++
                stdout.write(`\r${(count / total * 100).toFixed(3)}%`)
            })())
            if (promises.length >= config.downloadSegmentThreads) {
                await Promise.all(promises)
                promises = []
            }
        }
        await Promise.all(promises)
        if (newIds.length === 0) {
            break
        }
        ids = newIds
    }
    stdout.write('\r        \n')
    if (count === total) {
        return 200
    }
    return 500
}
async function convertVideo(path: string, newPath: string) {
    return await new Promise((resolve: (val: number) => void) => {
        const subProcess = spawn('ffmpeg', ['-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy', '-i', path, '-movflags', 'faststart', '-c', 'copy', newPath], {
            stdio: 'inherit'
        })
        subProcess.addListener('exit', code => {
            resolve(code ?? 1)
        })
        subProcess.addListener('error', err => {
            subProcess.kill()
            clit.out(err)
            resolve(1)
        })
    })
}
function rm(path: string) {
    if (!existsSync(path)) {
        return
    }
    if (!statSync(path).isDirectory()) {
        unlinkSync(path)
        return
    }
    for (const file of readdirSync(path)) {
        rm(join(path, file))
    }
    rmdirSync(path)
}
export async function download() {
    while (true) {
        const lesson = lessons.pop()
        if (lesson === undefined) {
            break
        }
        const {url, courseFolder, lessonName} = lesson
        const path = join(archiveDir, `${courseFolder}/${lessonName}.mp4`)
        if (existsSync(path)) {
            saveLessons()
            continue
        }
        if (url.endsWith('.m3u8')) {
            const m3u8Path = join(archiveDir, `${courseFolder}/${lessonName}.m3u8`)
            if (!existsSync(m3u8Path)) {
                saveLessons()
                continue
            }
            let remoteDir = ''
            const ids: number[] = []
            const string = readFileSync(m3u8Path, {encoding: 'utf8'})
                .replace(/URI=".+\/(.+)"/, `URI="http://${address}:${config.keyServerPort}/$1"`)
                .replace(/\n(.+)segment_(\d+).ts/g, (_, dir, id) => {
                    remoteDir = dir
                    ids.push(Number(id))
                    return `\n${id}.ts`
                })
            if (remoteDir.length === 0 || ids.length === 0) {
                lessons.unshift(lesson)
                saveLessons()
                clit.out(`Fail to convert ${m3u8Path}`)
                await clit.sleep(config.errSleep)
                continue
            }
            const tmpDir = join(archiveDir, `${courseFolder}/tmp/`)
            const tmpPath = join(tmpDir, 'tmp.m3u8')
            if (!existsSync(tmpDir)) {
                mkdirSync(tmpDir)
            }
            if (await downloadSegments(tmpDir, remoteDir, ids) !== 200) {
                lessons.unshift(lesson)
                saveLessons()
                clit.out(`Fail to convert ${m3u8Path}`)
                await clit.sleep(config.errSleep)
                continue
            }
            writeFileSync(tmpPath, string)
            if (await convertVideo(tmpPath, path) === 0) {
                saveLessons()
                rm(tmpDir)
                clit.out(`${m3u8Path} converted`)
                continue
            }
            lessons.unshift(lesson)
            saveLessons()
            clit.out(`Fail to convert ${m3u8Path}`)
            if (existsSync(path)) {
                unlinkSync(path)
            }
            await clit.sleep(config.errSleep)
            continue
        }
        const result = await clit.download(url, path, {
            referer: 'https://livingroomhqy.pku.edu.cn/',
            requestTimeout: config.downloadVideoTimeout,
            proxy: config.downloadFirmVideoProxy,
            verbose: true
        })
        if (result === 200) {
            saveLessons()
            clit.out(`${url} downloaded to ${path}`)
            continue
        }
        lessons.unshift(lesson)
        saveLessons()
        clit.out(`${result}, fail to download ${url} to ${path}`)
        await clit.sleep(config.errSleep)
    }
    clit.out('Finished')
}