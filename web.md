# 获取所有录播的地址

打开教学网中任一录播观看页面 (形如 `https://course.pku.edu.cn/webapps/bb-streammedia-hqy-bb_bb60/playVideo.action?hqyCourseId=34241&hqySubId=789877&kcwybm=21222-001-00112610-0006172287-3`).

按 `Ctrl+Shift+i` 再按 `Ctrl+~` 进入控制台 (Console), 粘帖如下命令并回车.

(需等待一分钟左右)

等弹窗提示`第一步完成`后, 在弹窗中点确定, 然后页面会跳转到 `yjapise.pku.edu.cn` 开头的网址, 然后再次粘帖如下命令并回车.

(需等待半小时左右)

等弹窗提示`第二步完成`后, 在弹窗中点确定, 然后页面会跳转到 `resourcese.pku.edu.cn` 开头的网址, 然后再次粘帖如下命令并回车.

(需等待一分钟左右)

最终, 页面会自动下载一个 `lessons.json` 文件, 其中包含了用户的所有录播的地址.

```js
async function g(o){await new Promise(s=>setTimeout(s,o*1e3))}async function h(o,s={},r="",i="",a){let e=new URL(o);for(let t in s)e.searchParams.set(t,s[t].toString());for(let t=0;t<10;t++){let n=await new Promise(async c=>{let u=new AbortController;setTimeout(()=>{u.abort(),c(void 0)},1e4);try{let d=await fetch(e,{headers:a,credentials:"include",signal:u.signal});c({body:await d.text()});return}catch(d){u.abort(),console.error(d)}await g(5),c(void 0)});if(n!==void 0)return n}throw new Error(`Fail to get ${o}`)}async function k(o){let s="";try{s+=(await h("https://course.pku.edu.cn/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_3_1",{},o)).body}catch(e){e instanceof Error&&console.error(e)}let r=[];for(let[,e]of s.matchAll(/key=_(\d+)/g))r.push(e);let i=[];for(let[,e]of s.matchAll(/top">([\w-]+): /g))i.push(e);r.length!==i.length&&console.error("Fail to get course ids");let a=[];for(let e=0;e<r.length;e++){let t=r[e],n=i[e];a.push({id:t,long:n})}return a}async function _(o,s){let{body:r}=await h("https://course.pku.edu.cn/webapps/bb-streammedia-hqy-bb_bb60/videoList.action",{course_id:`_${s}_1`},o),i=r.match(/hqyCourseId=(\d+)/);if(i===null)return[];let a=i[1],e=[];for(let[,t,n]of r.matchAll(/(\d{4}-\d{2}-\d{2}第\d+-\d+节)[\s\S]+?hqySubId=(\d+)/g))e.push(`${a}-${n}`);return e}async function $(o,s,r){let[i,a]=s.split("-"),{body:e}=await h("https://yjapise.pku.edu.cn/courseapi/v2/schedule/search-live-course-list",{all:"1",course_id:i,sub_id:a,with_sub_data:"1"},o,void 0),t=JSON.parse(e).list;if(t===void 0||t.length===0)return;let{title:n,sub_title:c,sub_content:u,realname:d}=t[0],{save_playback:{contents:l}}=JSON.parse(u),p;if(Array.isArray(l)){let m=l.find(f=>Number(f.resolution.slice(0,4))>=1080&&!f.preview.includes("expire="));if(m!==void 0){let f=m.preview;typeof f=="string"&&(p=f)}}else typeof l=="string"&&(l.endsWith(".mp4")||l.endsWith(".m3u8"))&&(p=l);if(p===void 0){console.error(`Fail to get info of ${n} ${c}`);return}let[,w,y]=(c.match(/^(\d+)-(\d+)/)??[,0,0]).map(Number),b="Fall";y===7||y===8?b="Summer":y<7&&y>1&&(b="Spring");let I={url:p,courseFolder:`${n} (${w} ${b} ${d}) ${r}`,lessonName:c};return console.info(`Get info of ${n} ${c}`),I}async function S(){let o=[],s="",r="",i=[];if(location.host==="course.pku.edu.cn"){for(let{id:t}of await k(s)){let n=await _(s,t);i.push({id:t,lessonIds:n})}alert("\u7B2C\u4E00\u6B65\u5B8C\u6210"),location.replace(`https://yjapise.pku.edu.cn/#${encodeURIComponent(JSON.stringify(i))}`);return}if(location.host==="yjapise.pku.edu.cn"){i.push(...JSON.parse(decodeURIComponent(location.hash.slice(1))));for(let{id:t,lessonIds:n}of i)for(let c of n){await g(1);let u=await $(r,c,t);if(u===void 0)break;o.push(u)}alert("\u7B2C\u4E8C\u6B65\u5B8C\u6210"),location.replace(`https://resourcese.pku.edu.cn/play/#${encodeURIComponent(JSON.stringify(o))}`);return}o.push(...JSON.parse(decodeURIComponent(location.hash.slice(1))));for(let t of o)if(t.url.endsWith(".m3u8")){let{body:n}=await h(t.url),c=n.match(/URI="(.+)"/);if(c!==null){let u=(await h(c[1],void 0,r)).body;u.length===16&&(t.key=u)}}let a=document.createElement("a"),e=JSON.stringify(o,void 0,4);a.href=URL.createObjectURL(new Blob([e])),a.download="lessons.json",a.click(),console.info("Finished")}S();
```
