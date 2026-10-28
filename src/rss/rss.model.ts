export interface Structured {
	title: string
	infoHash: string
	magnetURI: string
	release: string
	files: {
		name: string
		path: string
		crc32: string
	}[]
}
