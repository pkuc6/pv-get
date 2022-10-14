import type {Lesson} from './init'
type Term = 'Fall' | 'Spring' | 'Summer'
async function sleep(seconds: number) {
    await new Promise(r => setTimeout(r, seconds * 1000))
}
async function get(url: string, params: Record<string, string | number> = {}, cookie = '', referer = '', headers?: HeadersInit) {
    for (let i = 0; i < 10; i++) {
        const urlObj = new URL(url)
        for (const key in params) {
            urlObj.searchParams.set(key, params[key].toString())
        }
        try {
            const res = await fetch(urlObj, {
                headers,
                credentials: 'include',
                mode: 'no-cors'
            })
            return {
                body: await res.text()
            }
        } catch (err) {
            console.error(err)
        }
        await sleep(5)
    }
    throw new Error(`Fail to get ${url}`)
}
async function getCourseIds(cookie: string) {
    let body = ''
    try {
        body += (await get('https://course.pku.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_3_1', {
        }, cookie)).body
    } catch (err) {
        if (err instanceof Error) {
            console.error(err)
        }
    }
    const ids: string[] = []
    for (const [, id] of body.matchAll(/key=_(\d+)/g)) {
        ids.push(id)
    }
    const longIds: string[] = []
    for (const [, id] of body.matchAll(/top">([\w-]+): /g)) {
        longIds.push(id)
    }
    if (ids.length !== longIds.length) {
        console.error('Fail to get course ids')
    }
    const out: {
        id: string
        long: string
    }[] = []
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const long = longIds[i]
        out.push({
            id,
            long
        })
    }
    return out
}
async function getLessonIds(cookie: string, courseId: string) {
    const {body} = await get('https://course.pku.edu.cn/webapps/bb-streammedia-hqy-bb_bb60/videoList.action', {
        course_id: `_${courseId}_1`
    }, cookie)
    const match = body.match(/hqyCourseId=(\d+)/)
    if (match === null) {
        return []
    }
    const hqyCourseId = match[1]
    const ids: string[] = []
    for (const [, name, subId] of body.matchAll(/(\d{4}-\d{2}-\d{2}第\d+-\d+节)[\s\S]+?hqySubId=(\d+)/g)) {
        ids.push(`${hqyCourseId}-${subId}`)
    }
    return ids
}
async function getLessonInfo(hqyCookie: string, lessonId: string, courseId: string) {
    const [hqyCourseId, hqySubId] = lessonId.split('-')
    const {body} = await get('https://yjapise.pku.edu.cn/courseapi/v2/schedule/search-live-course-list', {
        all: '1',
        course_id: hqyCourseId,
        sub_id: hqySubId,
        with_sub_data: '1'
    }, hqyCookie, undefined)
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
    } else if (typeof surl === 'string' && (surl.endsWith('.mp4') || surl.endsWith('.m3u8'))) {
        url = surl
    }
    if (url === undefined) {
        console.error(`Fail to get info of ${courseName} ${lessonName}`)
        return
    }
    const [, year, month] = (lessonName.match(/^(\d+)-(\d+)/) ?? [, 0, 0]).map(Number)
    let term: Term = 'Fall'
    if (month === 7 || month === 8) {
        term = 'Summer'
    } else if (month < 7 && month > 1) {
        term = 'Spring'
    }
    const info: Lesson = {
        url,
        courseFolder: `${courseName} (${year} ${term} ${teacher}) ${courseId}`,
        lessonName,
    }
    if (url.endsWith('.m3u8')) {
        const {body} = await get(url)
        const match = body.match(/URI="(.+)"/)
        if (match !== null) {
            const key = (await get(match[1], undefined, hqyCookie)).body
            if (key.length === 16) {
                info.key = key
            }
        }
    }
    console.info(`Get info of ${courseName} ${lessonName}`)
    return info
}
async function collect() {
    const lessons: Lesson[] = []
    const cookie = ''
    let hqyCookie = ''
    const courses: {
        id: string
        lessonIds: string[]
    }[] = []
    if (location.host === 'course.pku.edu.cn') {
        for (const {id} of await getCourseIds(cookie)) {
            const lessonIds = await getLessonIds(cookie, id)
            courses.push({
                id,
                lessonIds
            })
        }
        alert('第一步完成')
        location.replace(`https://yjapise.pku.edu.cn/#${encodeURIComponent(JSON.stringify(courses))}`)
        return
    }
    courses.push(...JSON.parse(decodeURIComponent(location.hash.slice(1))))
    for (const {id, lessonIds} of courses) {
        for (const lessonId of lessonIds) {
            await sleep(1)
            const info = await getLessonInfo(hqyCookie, lessonId, id)
            if (info === undefined) {
                break
            }
            lessons.push(info)
        }
    }
    const a = document.createElement('a')
    const string = JSON.stringify(lessons, undefined, 4)
    a.href = URL.createObjectURL(new Blob([string]))
    a.download = 'lessons.json'
    a.click()
    console.info('Finished')
}
collect()