import { Logger } from 'ez-ts-logger'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import Parser from 'rss-parser'
import environment from '../environment.js'
import { Feed, Item } from './rss.model.js'

const CACHE_ROOT = './cache'
const CACHE_RSS_FEED = `${CACHE_ROOT}/rss.json`
const RSS_FEED_URL = `https://onepace.net/en/releases/rss.xml`

export class RSSController {
	private readonly parser: Parser<Feed, Item> = new Parser({
		customFields: {
			item: ['torrent:magnetURI', 'torrent:infoHash'],
		},
	})

	private feed: Parser.Output<any>

	public async init() {
		if (existsSync(CACHE_RSS_FEED)) {
			if (environment.GOOGLE_DEVELOPER_MODE) {
				try {
					Logger.debug('Loading RSS from cache')
					this.feed = JSON.parse(readFileSync(CACHE_RSS_FEED).toString())
					Logger.info('Loaded RSS from cache')
				} catch (e) {
					Logger.warn(`Couldn't parse cached file. Re-scraping`)
				}
			} else {
				try {
					Logger.debug('Loading RSS from cache')
					const local = JSON.parse(readFileSync(CACHE_RSS_FEED).toString())
					const lastLocalUpdate = new Date(local.lastBuildDate)

					const remote = await this.fetch()
					//@ts-ignore
					const lastRemoteUpdate = new Date(remote.lastBuildDate)

					if (lastRemoteUpdate > lastLocalUpdate) {
						Logger.info(`New RSS updates, updating Local`)
						this.feed = await this.fetch()
					} else {
						Logger.info('Loaded RSS from cache')
					}
				} catch (e) {
					Logger.warn(`Couldn't parse cached file. Re-scraping`)
					this.feed = await this.fetch()
				}
			}
		} else {
			this.feed = await this.fetch()
			Logger.info('Fetched RSS from remote')
		}
	}

	private async fetch() {
		Logger.debug(`Fetching OnePace RSS Feed`)
		try {
			const feed = await this.parser.parseURL(RSS_FEED_URL)
			writeFileSync(CACHE_RSS_FEED, JSON.stringify(feed, null, 2))
			return feed
		} catch (e) {
			Logger.error(`Error while fetching RSS feed...`)
			throw e
		}
	}

	public async getLastUdate(): Promise<Date> {
		if (!this.feed) {
			this.feed = await this.fetch()
		}
		//@ts-ignore
		return new Date(this.feed.lastBuildDate)
	}

	public async getTorrentInfo(title: string): Promise<{
		magnetURI: string
		hash: string
		partOfBundle?: boolean
	}> {
		if (!this.feed) {
			this.feed = await this.fetch()
		}

		let rssTitle = title.replace(
			'The Adventures of the Straw Hats',
			'If You Could Go Anywhere... The Adventures of the Straw Hats',
		)

		if (title === 'Skypiea 20') {
			Logger.debug(`Manual override for Skzpiea 20 (not in RSS feed)`)
			return {
				magnetURI:
					'magnet:?xt=urn:btih:f310ad44380a16a0fef792b5738affccbb0fc65c&dn=%5BOne%20Pace%5D%5B290-291%5D%20Skypiea%2020%20%5B1080p%5D%5B481A9A9D%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
				hash: 'f310ad44380a16a0fef792b5738affccbb0fc65c',
			}
		} else if (title.startsWith('Wano')) {
			let episode = Number.parseInt(title.replace('Wano ', ''))
			if (episode > 4 && episode < 13) {
				Logger.debug(`Manual override for Wano 05-12 (Batch Act 1 Download)`)
				return {
					magnetURI:
						'magnet:?xt=urn:btih:d67ed82392c28cb6c40509383ba70bfb4e6aefdf&dn=%5BOne+Pace%5D%5B909-924%5D+Wano+Act+1&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Ftracker.open-internet.nl%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=https%3A%2F%2F1.track.ga%3A443%2Fannounce',
					hash: 'd67ed82392c28cb6c40509383ba70bfb4e6aefdf',
					partOfBundle: true,
				}
			}
		}

		let activeItems = this.feed.items.filter(i => {
			for (let cat of i.categories)
				if (cat._ === 'outdated') {
					return false
				}
			return true
		})

		let item = activeItems.find(i => i.title === rssTitle)
		if (item && item['torrent:magnetURI']) {
			Logger.debug(`Found magnetURI for '${rssTitle}'...`)
			return {
				magnetURI: item['torrent:magnetURI'],
				hash: item['torrent:infoHash'],
			}
		} else {
			Logger.debug(
				`Searching magnetURI for '${rssTitle.replace(/\ [0-9]+$/, '')}'...`,
			)
			item = activeItems.find(
				i => i.title === rssTitle.replace(/\ [0-9]+$/, ''),
			)
			if (item && item['torrent:magnetURI']) {
				Logger.debug(
					`Found magnetURI for '${rssTitle.replace(/\ [0-9]+$/, '')}'...`,
				)
				return {
					magnetURI: item['torrent:magnetURI'],
					hash: item['torrent:infoHash'],
					partOfBundle: true,
				}
			} else throw new Error('MagnetURI not found...')
		}
	}
}
