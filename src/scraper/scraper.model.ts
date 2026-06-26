export type ScrapedGoogleDocument = {
	title: string
	lastModified: string

	sheets: ScrapedSheet[]
}

export type ScrapedSheet = {
	title: string
	index: number
	rows: unknown[][]
}
