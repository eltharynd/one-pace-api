import { sheets as _sheets, sheets_v4 } from '@googleapis/sheets'
import { Logger } from 'ez-ts-logger'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import environment from '../environment.js'
import { ScrapedEpisodeGuide, ScrapedSheet } from './scraper.model.js'

const CACHE_ROOT = './cache'
const CACHE_EPISODE_GUIDE = `${CACHE_ROOT}/episode-guide.json`

type RawSpreadsheetData = {
	document: sheets_v4.Schema$Spreadsheet
	valueRanges: sheets_v4.Schema$ValueRange[]
}

export class Scraper {
	private readonly sheets = _sheets({
		version: 'v4',
		auth: environment.GOOGLE_API_KEY,
	})

	private scrapedEpisodeGuide: ScrapedEpisodeGuide

	async init(): Promise<void> {
		Logger.debug('Scraping episode guide')
		this.scrapedEpisodeGuide = await this.parseEpisodeGuide()
		Logger.debug(
			`Parsed ${this.scrapedEpisodeGuide.sheets.length} sheets from "${this.scrapedEpisodeGuide.title}"`,
		)
	}

	private async parseEpisodeGuide(): Promise<ScrapedEpisodeGuide> {
		if (environment.GOOGLE_DEVELOPER_MODE && existsSync(CACHE_EPISODE_GUIDE)) {
			Logger.debug('Loading spreadsheet from cache')
			return JSON.parse(readFileSync(CACHE_EPISODE_GUIDE, 'utf-8'))
		} else {
			Logger.debug('Fetching spreadsheet from google')
			const { document, valueRanges } = await this.getRawData()
			const data = {
				title: document.properties?.title ?? '',
				lastUpdate: new Date().toISOString(),
				sheets: this.buildSheets(document, valueRanges),
			}
			mkdirSync(CACHE_ROOT, { recursive: true })
			writeFileSync(CACHE_EPISODE_GUIDE, JSON.stringify(data, null, 2))
			return data
		}
	}

	private buildSheets(
		document: sheets_v4.Schema$Spreadsheet,
		valueRanges: sheets_v4.Schema$ValueRange[],
	): ScrapedSheet[] {
		const sheets: ScrapedSheet[] = []

		for (const [i, sheet] of (document.sheets ?? []).entries()) {
			const props = sheet.properties
			if (!props?.title) continue

			sheets.push({
				title: props.title,
				index: props.index ?? i,
				rows: valueRanges[i]?.values ?? [],
			})
		}

		return sheets
	}

	private async getRawData(): Promise<RawSpreadsheetData> {
		const document = (
			await this.sheets.spreadsheets.get({
				spreadsheetId: environment.GOOGLE_SHEET_EPISODE_GUIDE,
				fields: 'properties.title,sheets.properties',
			})
		).data

		const sheetTitles = (document.sheets ?? [])
			.map(sheet => sheet.properties?.title)
			.filter((title): title is string => !!title)

		Logger.debug(`Fetching values for ${sheetTitles.length} sheets`)
		const { data } = await this.sheets.spreadsheets.values.batchGet({
			spreadsheetId: environment.GOOGLE_SHEET_EPISODE_GUIDE,
			ranges: sheetTitles.map(quoteSheetTitle),
			valueRenderOption: 'UNFORMATTED_VALUE',
			dateTimeRenderOption: 'FORMATTED_STRING',
		})

		const raw: RawSpreadsheetData = {
			document,
			valueRanges: data.valueRanges ?? [],
		}

		if (environment.GOOGLE_DEVELOPER_MODE) {
			mkdirSync(CACHE_ROOT, { recursive: true })
			writeFileSync(CACHE_EPISODE_GUIDE, JSON.stringify(raw))
			Logger.debug('cached spreadsheet to disk')
		}

		return raw
	}
}

const quoteSheetTitle = (title: string): string => {
	return `'${title.replace(/'/g, "''")}'`
}
