export type ScrapedEpisodeGuide = {
	title: string
	lastUpdate: string

	sheets: ScrapedSheet[]
}

export type ScrapedSheet = {
	title: string
	index: number
	rows: unknown[][]
}
