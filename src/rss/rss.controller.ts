import { Logger } from 'ez-ts-logger'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Context } from '../util/context.js'
import { Structured } from './rss.model.js'

const CACHE_ROOT = './cache'
const CACHE_RSS_FEED = `${CACHE_ROOT}/rss.json`

const PRE_PROCESSED_ROOT = './pre-processed'
const PRE_PROCESSED_OUTPUT = `${PRE_PROCESSED_ROOT}/torrents.json`

//const RSS_FEED_URL = `https://onepace.net/en/releases/rss.xml`

export class RSSController {
	feed: Structured[]

	public async init() {
		if (!this.feed) {
			if (existsSync(PRE_PROCESSED_OUTPUT)) {
				try {
					const torrents: Structured[] = JSON.parse(
						readFileSync(PRE_PROCESSED_OUTPUT).toString(),
					)
					if (torrents.length > 0) this.feed = structuredClone(torrents)
					else Logger.warn(`Empty pre-processed torrents file`)
				} catch (e) {
					Logger.error(`Could not parse pre processed torrents`)
				}
			}
		}
	}

	public async updateHandler(data: Structured[]) {
		await writeFileSync(PRE_PROCESSED_OUTPUT, JSON.stringify(data, null, 2))
		this.feed = data
		await Context.metadata.init()
	}

	public async getLastUdate(): Promise<Date> {
		return new Date(this.feed[0].release)
	}

	getAll(): Structured[] {
		return structuredClone(this.feed)
	}

	public findTorrent(crc32: string): Structured {
		return this.feed.find(t => t.files.find(f => f.crc32 == crc32))
	}
}
