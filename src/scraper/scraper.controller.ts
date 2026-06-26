import { drive as _drive } from '@googleapis/drive'
import { sheets as _sheets, sheets_v4 } from '@googleapis/sheets'
import { Logger } from 'ez-ts-logger'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import environment from '../environment.js'
import { ScrapedGoogleDocument, ScrapedSheet } from './scraper.model.js'

const CACHE_ROOT = './cache'
const CACHE_EPISODE_GUIDE = `${CACHE_ROOT}/episode-guide.json`
const CACHE_EPISODE_DESCRIPTIONS = `${CACHE_ROOT}/episode-description.json`

type RawSpreadsheetData = {
	document: sheets_v4.Schema$Spreadsheet
	valueRanges: sheets_v4.Schema$ValueRange[]
}

export class Scraper {
	private readonly sheets = _sheets({
		version: 'v4',
		auth: environment.GOOGLE_API_KEY,
	})
	private readonly drive = _drive({
		version: 'v3',
		auth: environment.GOOGLE_API_KEY,
	})

	private scrapedEpisodeGuide: ScrapedGoogleDocument
	private scrapedEpisodeDescriptions: ScrapedGoogleDocument

	async init(): Promise<void> {
		Logger.debug('Scraping episode guide')
		this.scrapedEpisodeGuide = await this.scrapeGoogleDocument(
			environment.GOOGLE_SHEET_EPISODE_GUIDE,
			CACHE_EPISODE_GUIDE,
		)
		Logger.info(
			`Parsed ${this.scrapedEpisodeGuide.sheets.length} sheets from "${this.scrapedEpisodeGuide.title}"`,
		)

		Logger.debug('Scraping episode descriptions')
		this.scrapedEpisodeDescriptions = await this.scrapeGoogleDocument(
			environment.GOOGLE_SHEET_EPISODE_DESCRIPTION,
			CACHE_EPISODE_DESCRIPTIONS,
		)
		Logger.info(
			`Parsed ${this.scrapedEpisodeDescriptions.sheets.length} sheets from "${this.scrapedEpisodeDescriptions.title}"`,
		)
	}

	public async getLastUdate(): Promise<Date> {
		if (!this.scrapedEpisodeGuide || !this.scrapedEpisodeDescriptions)
			await this.init()

		if (
			this.scrapedEpisodeGuide.lastModified >
			this.scrapedEpisodeDescriptions.lastModified
		)
			return new Date(this.scrapedEpisodeGuide.lastModified)
		else return new Date(this.scrapedEpisodeDescriptions.lastModified)
	}

	getEpisodeGuide(): ScrapedGoogleDocument {
		return structuredClone(this.scrapedEpisodeGuide)
	}

	getEpisodeDescriptions(): ScrapedGoogleDocument {
		return structuredClone(this.scrapedEpisodeDescriptions)
	}

	private async scrapeGoogleDocument(
		spreadsheetId: string,
		path: string,
	): Promise<ScrapedGoogleDocument> {
		if (existsSync(path)) {
			if (environment.GOOGLE_DEVELOPER_MODE) {
				try {
					Logger.debug('Loading spreadsheet from cache')
					const local = JSON.parse(readFileSync(path, 'utf-8'))
					Logger.info('Loaded spreadsheet from cache')
				} catch (e) {
					Logger.warn(`Couldn't parse cached file. Re-scraping`)
					return await this.scrapeGoogleDocument(spreadsheetId, path)
				}
			} else {
				try {
					Logger.debug('Loading spreadsheet from cache')
					const local = JSON.parse(readFileSync(path, 'utf-8'))
					const lastLocalUpdate = new Date(local.lastModified)
					const lastRemoteUpdate = new Date(
						await this.getSheetModifiedTime(spreadsheetId),
					)
					if (lastRemoteUpdate > lastLocalUpdate) {
						Logger.info(`New Remote updates, updating Local`)
						return await this.scrapeGoogleDocument(spreadsheetId, path)
					} else {
						Logger.info('Loaded spreadsheet from cache')
						return local
					}
				} catch (e) {
					Logger.warn(`Couldn't parse cached file. Re-scraping`)
					return await this.scrapeGoogleDocument(spreadsheetId, path)
				}
			}
		} else {
			Logger.debug('Fetching spreadsheet from google')
			const { document, valueRanges } = await this.getRawData(spreadsheetId)

			const data = {
				title: document.properties?.title ?? '',
				lastModified: await this.getSheetModifiedTime(spreadsheetId),
				sheets: this.buildSheets(document, valueRanges),
			}
			mkdirSync(CACHE_ROOT, { recursive: true })
			writeFileSync(path, JSON.stringify(data, null, 2))
			return data
		}
	}

	private async getSheetModifiedTime(spreadsheetId: string): Promise<string> {
		const { data } = await this.drive.files.get({
			fileId: spreadsheetId,
			fields: 'modifiedTime',
		})
		return data.modifiedTime
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

	private async getRawData(spreadsheetId: string): Promise<RawSpreadsheetData> {
		const document = (
			await this.sheets.spreadsheets.get({
				spreadsheetId: spreadsheetId,
				fields: 'properties.title,sheets.properties',
			})
		).data

		const sheetTitles = (document.sheets ?? [])
			.map(sheet => sheet.properties?.title)
			.filter((title): title is string => !!title)

		Logger.debug(`Fetching values for ${sheetTitles.length} sheets`)
		const { data } = await this.sheets.spreadsheets.values.batchGet({
			spreadsheetId: spreadsheetId,
			ranges: sheetTitles.map(quoteSheetTitle),
			valueRenderOption: 'UNFORMATTED_VALUE',
			dateTimeRenderOption: 'FORMATTED_STRING',
		})

		const raw: RawSpreadsheetData = {
			document,
			valueRanges: data.valueRanges ?? [],
		}

		return raw
	}
}

const quoteSheetTitle = (title: string): string => {
	return `'${title.replace(/'/g, "''")}'`
}
