# PV Get

- Require [ffmpeg](http://ffmpeg.org).
- Require [git](https://git-scm.com).
- Require [nodejs](https://nodejs.org).

This is a tool for downloading 1080p pku lesson videos from [blackboard](https://course.pku.edu.cn).

## Install

```
git clone https://github.com/pkuc6/pv-get.git
```

```
cd pv-get
```

```
npm ci
```

Fill in the `users` field in `config.json`.

## Use

```
npm run collect

```
(Optional) Modify `lessons.json` to decide which lessons to download.

```
npm run download
```