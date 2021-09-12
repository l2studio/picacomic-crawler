import { PicaComicAPI, Comic, ComicInfo, ComicEpisode, ComicEpisodePage } from '@l2studio/picacomic-api'
import CosplayModel, { CosplayDocument } from './cosplay.model'
import cron from 'node-cron'
import path from 'path'
import fs from 'fs'
import { Types } from 'mongoose'

const debug = require('debug')('lgou2w:picacomic-crawler')
const runDir = path.resolve(__dirname)
const dataDir = path.resolve(runDir, '..', 'data')

debug('工作目录：', runDir)
fs.existsSync(dataDir) || fs.mkdirSync(dataDir)

/// 令牌和认证上下文

const PICACOMIC_USER = process.env.PICACOMIC_USER!
const PICACOMIC_PASS = process.env.PICACOMIC_PASS!

if (!PICACOMIC_USER || !PICACOMIC_PASS) {
  console.error('无效的 PicaComic 用户或密码')
  process.exit(1)
} else {
  debug('PicaComic 用户：', PICACOMIC_USER)
  debug('PicaComic 密码：', PICACOMIC_PASS.substring(0, 1) + '*****')
}

const tokenDataFile = path.resolve(dataDir, '.token')

let token = readTokenData()
const picacomic = new PicaComicAPI({
  proxy: process.env.PROXY_HOST && process.env.PROXY_PORT
    ? { host: process.env.PROXY_HOST, port: parseInt(process.env.PROXY_PORT) }
    : undefined,
  reauthorizationTokenCallback: async (self) => {
    debug('账户令牌已失效，重新登入...')
    try {
      token = await self.signIn({ email: PICACOMIC_USER, password: PICACOMIC_PASS })
    } catch (e) {
      console.error('登入失败：', e)
      process.exit(1)
    }
    debug('重新登入成功')
    writeTokenData(token)
    return token
  }
})

function readTokenData (): string | '' {
  debug('读取令牌数据文件：', tokenDataFile)
  return fs.existsSync(tokenDataFile)
    ? fs.readFileSync(tokenDataFile, { encoding: 'utf-8' })
    : ''
}

function writeTokenData (token: string) {
  debug('写入令牌数据文件：', token.substring(0, 10) + '*****')
  fs.writeFileSync(tokenDataFile, token)
}

/// 类型定义

type ComicDataAndUnion = Comic & ComicInfo & { episodes: (ComicEpisode & { pages: ComicEpisodePage[] })[] }

/// 数据获取上下文

async function fetchComics (page?: number) {
  debug('获取第 %d 页的 Cosplay 数据...', page || 1)
  return picacomic.fetchComics({ token, category: 'Cosplay', page })
}

async function fetchComicInfo (comic: Comic) {
  debug('获取 \'%s\' 的详细数据...', comic.title)
  return picacomic.fetchComic({ token, id: comic._id })
}

async function fetchComicEpisodes (comic: Comic, page?: number) {
  debug('获取 \'%s\' 的第 %d 页的分话数据...', comic.title, page || 1)
  return picacomic.fetchComicEpisodes({ token, comicId: comic._id, page })
}

async function fetchComicEpisodePages (comic: Comic, epsOrder: number, page?: number) {
  debug('获取 \'%s\' 的第 %d 分话的第 %d 页的内容数据...', comic.title, epsOrder, page || 1)
  return picacomic.fetchComicEpisodePages({ token, comicId: comic._id, epsOrder, page })
}

async function fetchComicDataAndUnion (comic: Comic): Promise<ComicDataAndUnion> {
  const info = await fetchComicInfo(comic)
  const episodes: ComicDataAndUnion['episodes'] = []
  // 获取此漫画的所有分话数据
  // eslint-disable-next-line no-lone-blocks
  {
    let page = 1
    let pages = 0
    do {
      const eps = await fetchComicEpisodes(comic, page++)
      for (const ep of eps.docs) {
        episodes.push({ ...ep, pages: [] })
      }
      pages = eps.pages
    } while (page <= pages)
  }
  // 按分话的 Order 排序数据，防止乱序
  episodes.sort((a, b) => a.order - b.order)
  // 从所有分话数据获取所有页面内容并填充到对应分话中
  // eslint-disable-next-line no-lone-blocks
  {
    for (const episode of episodes) {
      let page = 1
      let pages = 0
      do {
        const epPages = await fetchComicEpisodePages(comic, episode.order, page++)
        episode.pages.push(...epPages.pages.docs)
        pages = epPages.pages.pages
      } while (page <= pages)
    }
  }
  return { ...comic, ...info, episodes }
}

/// 数据库交互

const TAG_COSPLAY = 'COSPLAY'

async function saveComic (comic: ComicDataAndUnion): Promise<CosplayDocument> {
  debug('查询 Cosplay 数据：', comic._id)
  const identify = new Types.ObjectId(comic._id)
  let cosplay = await existsComic(identify)
  if (cosplay) {
    debug('Cosplay 模型 %d 已录入，日期：', comic.title, cosplay._id.getTimestamp().toISOString())
    return cosplay
  }
  const tags = comic.tags.filter((tag) => tag !== TAG_COSPLAY)
  cosplay = new CosplayModel({
    identify,
    author: comic.author || 'NULL',
    title: comic.title,
    description: comic.description || 'NULL',
    thumb: comic.thumb.path,
    tags,
    totalPages: comic.pagesCount,
    totalEpisodes: comic.epsCount
  })
  for (const episode of comic.episodes) {
    const pages = episode.pages.map((page) => page.media.path)
    const episodeDoc = cosplay.episodes.create({
      identify: new Types.ObjectId(episode._id),
      title: episode.title,
      order: episode.order,
      updatedAt: new Date(episode.updated_at).valueOf(),
      pages
    })
    cosplay.episodes.push(episodeDoc)
  }
  debug('录入 Cosplay 模型...')
  await cosplay.save()
  return cosplay
}

async function existsComic (identify: string | Types.ObjectId): Promise<CosplayDocument | null> {
  const id = typeof identify === 'string' ? new Types.ObjectId(identify) : identify
  return await CosplayModel.findOne({ identify: id })
}

/// 主要运行时上下文

const cursorDataFile = path.resolve(dataDir, 'cursor.json')

function readCursorData (): { cursor: number, lastTotalPages: number } {
  debug('读取光标数据文件：', cursorDataFile)
  return fs.existsSync(cursorDataFile)
    ? JSON.parse(fs.readFileSync(cursorDataFile, { encoding: 'utf-8' }))
    : { cursor: 0, lastTotalPages: 0 }
}

function writeCursorData (cursor: number, lastTotalPages: number) {
  debug('写入光标数据文件：cursor=%d，lastTotalPages=%d', cursor, lastTotalPages)
  const data = JSON.stringify({ cursor, lastTotalPages })
  fs.writeFileSync(cursorDataFile, data)
}

let { cursor, lastTotalPages } = readCursorData()
let looping = false

async function run () {
  if (looping) {
    debug('已有任务正在运行，跳过')
    return
  }
  const currTotalPages = (await fetchComics()).pages
  if (!cursor) {
    cursor = lastTotalPages = currTotalPages
    writeCursorData(cursor, lastTotalPages)
  }
  if (lastTotalPages < currTotalPages) {
    debug('最后一次的总页 %d 小于当前时间总页数 %d，目前光标为：', lastTotalPages, currTotalPages, cursor)
    cursor += (currTotalPages - lastTotalPages)
    cursor > currTotalPages && (cursor = currTotalPages)
    lastTotalPages = currTotalPages
    debug('新的光标值：', cursor)
    writeCursorData(cursor, lastTotalPages)
  }
  async function loop () {
    const dirtPage = cursor
    if (dirtPage < 1) return
    try {
      const comics = await fetchComics(dirtPage)
      if (lastTotalPages < comics.pages) {
        debug('在获取 Cosplay 数据时，新的总页数大于最后一次总页，更新光标')
        cursor += (comics.pages - lastTotalPages)
        cursor > comics.pages && (cursor = comics.pages)
        lastTotalPages = comics.pages
        cursor++
      }
      debug('开始同步当前光标 %d 页的 Cosplay 数据集...', dirtPage)
      for (const comic of comics.docs) {
        const existed = await existsComic(comic._id)
        if (!existed) {
          const data = await fetchComicDataAndUnion(comic)
          await saveComic(data)
        }
      }
      cursor--
    } catch (e) {
      console.error('循环体内部出错：', e)
      writeCursorData(cursor, lastTotalPages)
      return
    }
    await loop()
  }
  debug('开始循环体...')
  try {
    looping = true
    await loop()
  } finally {
    debug('循环体完成')
    if (cursor <= 0) cursor = 1
    writeCursorData(cursor, lastTotalPages)
    looping = false
  }
}

function exitHandler () {
  debug('进程退出，保存状态...')
  writeCursorData(cursor, lastTotalPages)
}

process.once('exit', (code) => debug('退出码：', code))
process.once('SIGINT', exitHandler)
process.once('SIGQUIT', exitHandler)
process.once('SIGTERM', exitHandler)
process.once('SIGUSR1', exitHandler)
process.once('SIGUSR2', exitHandler)

const CRON_EXPRESSION = process.env.CRON_EXPRESSION
if (!CRON_EXPRESSION || !cron.validate(CRON_EXPRESSION)) {
  debug('无效的定时表达式：', CRON_EXPRESSION)
  process.exit(1)
}

cron.schedule(CRON_EXPRESSION, run, {
  scheduled: true,
  timezone: 'Asia/Shanghai'
})

run()
