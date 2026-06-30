import { Logger } from 'ez-ts-logger'
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { simpleGit } from 'simple-git'
import environment from '../environment.js'
import { ScrapedSheet } from '../scraper/scraper.model.js'
import { Context } from '../util/context.js'
import {
	ArcMetadata,
	EpisodeFilesMetadata,
	EpisodeMetadata,
	FileMetadata,
	Metadata,
	PreprocessedMagnet,
	RecursivePartial,
	reorderMetadata,
} from './metadata.model.js'

const OUTPUT_ROOT = './output'
const METADATA_OUTPUT = `${OUTPUT_ROOT}/metadata.json`

const REPO_DIR = './tmp/git-repo'
const REPO_METADATA_PATH = `${REPO_DIR}${OUTPUT_ROOT.replace('./', '/')}/metadata.json`
const BRANCH = 'main'

export class MetadataController {
	metadata: Metadata
	preProcessedMagnets: PreprocessedMagnet[]

	async init(force?: boolean): Promise<void> {
		if (
			existsSync(METADATA_OUTPUT) &&
			!environment.FORCE_REGENERATION &&
			!force
		) {
			try {
				Logger.debug(`Checking metadata from cache`)
				this.metadata = JSON.parse(readFileSync(METADATA_OUTPUT).toString())

				const lastRSSUpdate: Date = await Context.rss.getLastUdate()
				const lastScraperUpdate: Date = await Context.scraper.getLastUdate()
				const lastUpdate: Date = new Date(this.metadata.lastUpdate)
				if (lastRSSUpdate > lastUpdate || lastScraperUpdate > lastUpdate) {
					Logger.info(`Remote updates, renewing cached metadata...`)
					this.metadata = await this.process()

					this.notifyUpdates()
				} else {
					Logger.info('Loaded Metadata from cache')
				}
			} catch (e) {
				Logger.warn('Badly formed cached metadata, reprocessing')
				this.metadata = await this.process()

				this.notifyUpdates()
			}
		} else {
			Logger.debug(
				`Processing Metadata from remote sources${environment.FORCE_REGENERATION ? ' [Forced]' : ''}`,
			)
			this.metadata = await this.process()
			Logger.info(
				`Processed Metadata from remote sources${environment.FORCE_REGENERATION ? ' [Forced]' : ''}`,
			)

			this.notifyUpdates()
		}
	}

	getAll(): Metadata {
		return structuredClone(this.metadata)
	}

	private async notifyUpdates() {
		await Context.express.waitForActive()
		Logger.info(`Notifying sockets of updates`)
		Context.express.io.to('updates').emit('updates', Context.metadata.getAll())
	}

	private async commitChanges() {
		if (environment.GIT_AUTO_COMMIT) {
			try {
				Logger.debug(`Committing changes to repo`)

				const exists = await stat(path.join(REPO_DIR, '.git'))
					.then(() => true)
					.catch(() => false)

				const remoteUrl = `https://x-access-token:${environment.GIT_TOKEN}@github.com/eltharynd/one-pace-api.git`

				if (!exists) {
					Logger.debug(`Cloning repo`)
					mkdirSync(REPO_DIR, { recursive: true })
					await simpleGit().clone(remoteUrl, REPO_DIR, [
						'--branch',
						BRANCH,
						'--single-branch',
					])
				} else Logger.debug(`Repo already cloned`)

				Logger.debug(`Initializing simple git`)
				const git = simpleGit(REPO_DIR)

				Logger.debug(`Adding git configs`)
				await git.addConfig('user.name', 'github-actions[bot]')
				await git.addConfig(
					'user.email',
					'41898282+github-actions[bot]@users.noreply.github.com',
				)

				Logger.debug(`Pulling main branch`)
				await git.pull('origin', BRANCH)

				mkdirSync(path.dirname(REPO_METADATA_PATH), { recursive: true })
				copyFileSync(METADATA_OUTPUT, REPO_METADATA_PATH)

				Logger.debug(`git add -f ${METADATA_OUTPUT}`)
				await git.add(['-f', METADATA_OUTPUT])

				Logger.debug(`git status --ignored`)
				const status = await git.status(['--ignored'])
				if (status.staged.length === 0) {
					Logger.warn('No changes to commit')
					return
				}

				Logger.debug(`Committing`)
				await git.commit(`Chore: Automated updates`, METADATA_OUTPUT)
				Logger.debug(`Pushing`)
				await git.push('origin', BRANCH)

				Logger.info(`Committed changes to repo`)
			} catch (e) {
				Logger.errorAndThrow(e)
			}
		}
	}

	private async process(): Promise<Metadata> {
		let descriptions = Context.scraper.getEpisodeDescriptions()

		let buffer: RecursivePartial<Metadata> = {
			arcs: [],
		}
		buffer = await this.processEpisodeGuide(buffer)

		const arcsSheet = descriptions.sheets.find(s => /arcs/i.test(s.title))
		buffer = await this.processEpisodeDescritionsArcs(buffer, arcsSheet)

		const episodesSheet = descriptions.sheets.find(s =>
			/episodes/i.test(s.title),
		)
		buffer = await this.processEpisodeDescritionsEpisodes(buffer, episodesSheet)

		buffer = await this.processRSSFeed(buffer)

		const reordered: Metadata = reorderMetadata(buffer)

		Logger.debug(`Applying manual corrections`)
		this.manualCorrections(reordered)
		Logger.debug(`Applied manual corrections`)

		reordered.arcs = reordered.arcs.sort((a, b) => a.arc - b.arc)
		reordered.arcs.forEach(a => {
			a.episodes = a.episodes.sort((a, b) => a.episode - b.episode)
		})

		Logger.debug(`Writing metadata to file`)
		writeFileSync(METADATA_OUTPUT, JSON.stringify(reordered, null, 2))
		Logger.debug(`Metadata written to file`)

		this.commitChanges()

		return reordered
	}

	private async processEpisodeGuide(
		buffer: RecursivePartial<Metadata>,
	): Promise<RecursivePartial<Metadata>> {
		let guide = Context.scraper.getEpisodeGuide()

		for (let sheet of guide.sheets) {
			if (sheet.index == 0) {
				Logger.debug('Processing Arc Overview')

				let halfSeasons = 0

				for (let row of sheet.rows) {
					if (String(row[1]) == 'Totals' || String(row[1]) == 'Arcs') continue
					if (!row[1]) break

					let _arc = Number.parseFloat(String(row[0])) + halfSeasons
					if (_arc % 1 != 0) {
						_arc = Math.floor(_arc) + 1
						halfSeasons++
					}

					let arc: RecursivePartial<ArcMetadata> = {
						arc: _arc,
						title: String(row[1])
							.replace(/\ *\(.*\).*$/, '')
							.replace('Whiskey', 'Whisky')
							.replace('Arabasta', 'Alabasta'),

						status: /\(WIP\)/i.test(String(row[1]))
							? 'wip'
							: /\(TBR\)/i.test(String(row[1]))
								? 'tbr'
								: 'complete',
						mangaChapters: String(row[2]),
						mangaChaptersCount: Number(row[3]),
						animeEpisodes: String(row[4]),
						animeEpisodesCount: Number(row[5]),

						fillerEpisodes: String(row[6]),
						paceEpisodesCount: Number(row[7]),

						animeMinutes: Number(row[8]),
						paceMinutes: Number(row[9]),
						savedMinutes: Number(row[10]),
						savedPercentage: Number.parseFloat(String(row[11])),

						audioLanguages: String(row[12]).replaceAll(' ', '').split(','),
						subLanguages: String(row[13]).replaceAll(' ', '').split(','),
						subLanguagesPixeldrain: String(row[14])
							.replaceAll(' ', '')
							.split(','),
						resolution: String(row[15]),

						episodes: [],
					}
					buffer.arcs.push(arc)
				}
			} else {
				Logger.debug(`Processing ${sheet.index}. ${sheet.title}`)

				let arc = buffer.arcs.find(a => a.arc == sheet.index)

				for (let [index, row] of sheet.rows.entries()) {
					if (
						String(row[1]).includes('One Pace Episode') ||
						String(row[1]).includes('Forward')
					)
						continue
					if (!row[1]) break

					if (/G8/.test(String(row[1]))) {
						arc.episodes.find(e => e.episode == 25).files.alternate = {
							CRC32: String(row[6]),
							duration:
								Number.parseInt(String(row[5]).split(':')[0]) * 60 +
								Number.parseInt(String(row[5]).split(':')[1]),
							...(await Context.rss.getTorrentInfo(
								`${arc.title} 25 Alternate Cut (G-8)`,
							)),
							variant: 'alternate',
						}
						continue
					}

					let match = String(row[1]).match(/^\w+[\w\ ]+\ ([0-9]{1,3})/i)
					let episodeNumber =
						match?.length > 0 ? Number.parseInt(match[1]) : index

					let files: RecursivePartial<EpisodeFilesMetadata> = {
						standard: {
							CRC32: String(row[6]) == '702231E9' ? '704F68EA' : String(row[6]),
							duration:
								Number.parseInt(String(row[5]).split(':')[0]) * 60 +
								Number.parseInt(String(row[5]).split(':')[1]),
							...(await Context.rss.getTorrentInfo(
								`${arc.title} ${String(episodeNumber).padStart(2, '0')}`,
							)),
							variant: 'standard',
						},
					}

					if (row[7]) {
						if (/^[A-Z0-9]{8}$/.test(String(row[7]))) {
							files.extended = {
								CRC32:
									String(row[7]) == '702231E9' ? '704F68EA' : String(row[7]),
								duration:
									Number.parseInt(String(row[8]).split(':')[0]) * 60 +
									Number.parseInt(String(row[8]).split(':')[1]),
								...(await Context.rss.getTorrentInfo(
									`${arc.title} ${String(episodeNumber).padStart(2, '0')} Extended Cut`,
								)),
								variant: 'extended',
							}
						} else {
							let match = String(row[7]).match(/([A-Z0-9]{8})/)
							if (match?.length > 0) {
								files.standard.CRC32_inFileName = match[1]
								Logger.debug(
									`Corrected S${String(arc.arc).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`,
								)
							} else Logger.warn('CORRECTION FAILED')
						}
					}

					let episode: RecursivePartial<EpisodeMetadata> = {
						arc: arc.arc,
						episode: episodeNumber,

						mangaChapters: String(row[2]).replace('Ch. ', ''),
						animeEpisodes: String(row[3]).replace(/Ep\.\s/, ''),
						released: new Date(String(row[4])).toISOString(),

						files: files,
					}

					if (arc.arc == 17 && episode.episode == 0) {
						Logger.debug(`Manual correction for ${arc.arc}-${episode.episode}`)
						episode.title = 'The Wealthy Pirate Gang'
						episode.description =
							'While Donquixote Doflamingo punishes Bellamy for being defeated by Luffy, the Straw Hat Pirates continues their journey on the Octopus Balloon.'
					}

					arc.episodes.push(episode)
				}
			}
		}

		return structuredClone(buffer)
	}

	private async processEpisodeDescritionsArcs(
		buffer: RecursivePartial<Metadata>,
		arcsSheet: ScrapedSheet,
	): Promise<RecursivePartial<Metadata>> {
		for (let [index, row] of arcsSheet.rows.entries()) {
			if (/saga_title/i.test(String(row[0])) || !row[0] || !row[1]) continue

			let descriptionsArc = Number.parseInt(String(row[1]))
			if (descriptionsArc == 11) descriptionsArc = 10
			else if (descriptionsArc == 10) descriptionsArc = 11

			let arc: RecursivePartial<ArcMetadata> = buffer.arcs.find(
				a => a.arc == descriptionsArc,
			)
			if (!arc) {
				if (/Specials/i.test(String(row[2]))) {
					arc = {
						arc: 0,

						saga: String(row[0]),
						title: String(row[0])
							.replace('Whiskey', 'Whisky')
							.replace('Arabasta', 'Alabasta'),
						description: String(row[2])
							.replace('Whiskey', 'Whisky')
							.replace('Arabasta', 'Alabasta'),

						status: 'complete',

						episodes: [],
					}
					buffer.arcs.push(arc)
				} else continue
			}

			Logger.debug(`Processing ${row[2]} Arc Descriptions`)
			arc.saga = String(row[0])
			arc.title = String(row[2])
				.replace('Whiskey', 'Whisky')
				.replace('Arabasta', 'Alabasta')
			arc.description = String(row[3])
				.replace('Whiskey', 'Whisky')
				.replace('Arabasta', 'Alabasta')
		}

		return structuredClone(buffer)
	}

	private async processEpisodeDescritionsEpisodes(
		buffer: RecursivePartial<Metadata>,
		episodesSheet: ScrapedSheet,
	): Promise<RecursivePartial<Metadata>> {
		for (let [index, row] of episodesSheet.rows.entries()) {
			if (/arc_title/i.test(String(row[0])) || !row[0]) continue

			Logger.debug(
				`Processing '${String(row[0])} - ${String(row[1])}' Episode Descriptions`,
			)

			let arc: RecursivePartial<ArcMetadata> = buffer.arcs.find(
				a =>
					a.title ==
					String(row[0])
						.replace('One Piece Fan Letter', 'Specials')
						.replace(`Arabasta`, `Alabasta`),
			)

			if (arc) {
				let episode = arc.episodes.find(
					e =>
						e.episode ==
						(String(row[0]) == 'One Piece Fan Letter'
							? 0
							: Number.parseInt(String(row[1]))),
				)

				if (episode && arc.arc != 0) {
					if (!row[2]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' title is still empty`,
						)
						episode.title = `${String(row[0])} - ${String(row[1])}`.replace(
							'Whiskey',
							'Whisky',
						)
					} else
						episode.title = String(row[2])
							.replace('Whiskey', 'Whisky')
							.replace('Arabasta', 'Alabasta')

					if (!row[3]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' description is still empty`,
						)
					} else
						episode.description = String(row[3])
							.replace('Whiskey', 'Whisky')
							.replace('Arabasta', 'Alabasta')
				} else {
					if (arc.arc == 0 && row[1]) {
						const sheetNumber: number = Number(row[1])
						const correctedNumber: number =
							String(row[0]) == 'One Piece Fan Letter'
								? 1
								: String(row[0]) == 'Specials'
									? sheetNumber == 1
										? 3
										: sheetNumber == 2
											? 4
											: sheetNumber == 3
												? 5
												: sheetNumber == 4
													? 2
													: sheetNumber == 5
														? 6
														: sheetNumber == 6
															? -1
															: sheetNumber == 7
																? 7
																: sheetNumber == 8
																	? 8
																	: sheetNumber == 9
																		? 9
																		: sheetNumber == 10
																			? 10
																			: -1
									: sheetNumber

						if (correctedNumber <= 0) {
							Logger.warn(
								`Could not match '${String(row[0])}' '${Number(row[1])}' '${String(row[3])}' from Episode Descriptions to any episode...`,
							)
							continue
						}
						let _episode: RecursivePartial<EpisodeMetadata> = {
							arc: 0,
							episode: correctedNumber,
						}

						if (row[2])
							_episode.title = String(row[2])
								.replace('Whiskey', 'Whisky')
								.replace('Arabasta', 'Alabasta')
						if (row[3])
							_episode.description = String(row[3])
								.replace('Whiskey', 'Whisky')
								.replace('Arabasta', 'Alabasta')

						arc.episodes.push(_episode)
					} else if (row[1] && row[2] && row[3]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' from descriptions not found in guide but has descriptions. Adding...`,
						)
						arc.episodes.push({
							episode: Number(row[1]),
							title: String(row[2])
								.replace('Whiskey', 'Whisky')
								.replace('Arabasta', 'Alabasta'),
							description: String(row[3])
								.replace('Whiskey', 'Whisky')
								.replace('Arabasta', 'Alabasta'),
						})
					} else {
						Logger.warn(
							`Episode '${String(row[0])} - ${String(row[1])}' from descriptions not found in guide`,
						)
					}
				}
			} else
				Logger.warn(
					`Arc '${String(row[0])}' from descriptions not found in guide`,
				)
		}
		return structuredClone(buffer)
	}

	private async processRSSFeed(
		buffer: RecursivePartial<Metadata>,
	): Promise<RecursivePartial<Metadata>> {
		const rssFeed = Context.rss.getItems()

		for (let item of rssFeed) {
			const match = item.title.match(/^([a-z][a-z\-\.\'\s]+[a-z])(\s\d+)*/i)

			const infoHash = item['torrent:infoHash']
			const magnetURI = item['torrent:magnetURI']

			let arcTitle, episodeNumber
			let outdated: boolean = !!item.categories.find(c => c._ === 'outdated')

			if (match[1] == 'One Piece Fan Letter') {
				arcTitle = 'Specials'
				episodeNumber = 1
				if (!match[2]) {
					outdated = true
				}
			} else if (match[1] == 'Warship Island') {
				arcTitle = 'Specials'
				episodeNumber = 10
			} else if (
				match[1] ==
				'If You Could Go Anywhere... The Adventures of the Straw Hats'
			) {
				arcTitle =
					'If You Could Go Anywhere... The Adventures of the Straw Hats'
				episodeNumber = 1
			} else if (match[1] == 'The Trials of Koby-Meppo') {
				arcTitle = 'The Trials of Koby-Meppo'
				episodeNumber = 1
			} else if (match[1] == 'Gaimon') {
				arcTitle = 'Gaimon'
				episodeNumber = 1
			} else {
				arcTitle = match[1]
					.replace('Wano Act', 'Wano')
					.replace('Whiskey', 'Whisky')
					.replace('Arabasta', 'Alabasta')
				episodeNumber = match[2] ? Number.parseInt(match[2]) : null
			}

			const variant: 'standard' | 'extended' | 'alternate' = <
				'standard' | 'extended' | 'alternate'
			>item.categories
				.find(c => c._.startsWith('variant'))
				._.replace('variant/', '')
				.replace('regular', 'standard')

			const torrent = this.getPreProcessedMagnet(magnetURI)

			const partOfBundle = torrent?.files?.length > 1 ? true : false

			if (!partOfBundle) {
				const targetArc = buffer.arcs.find(a => a.title == arcTitle)
				if (!targetArc) {
					Logger.warn(`Could not match '${arcTitle}'`)
					continue
				}

				const targetEpisode = targetArc.episodes.find(e => {
					return e.episode == episodeNumber
				})
				if (!targetEpisode) {
					Logger.warn(`Could not match '${arcTitle}' episode ${episodeNumber}`)
					continue
				}

				const _file: RecursivePartial<FileMetadata> = {}

				if (torrent) {
					const crc32Match = torrent.name.match(/\[([A-Z0-9]{8})\]/)
					if (!crc32Match) {
						if (torrent.files.length == 1 && torrent.files[0].crc32) {
							_file.CRC32 = torrent.files[0].crc32
						} else {
							Logger.warn(`Couldn't find CRC32 in torrent '${torrent.name}'`)
						}
					} else {
						_file.CRC32 = crc32Match[1]
					}
				} else {
					Logger.warn('No torrent, unknown')
				}

				_file.hash = infoHash
				_file.magnetURI = magnetURI
				_file.variant = variant
				if (partOfBundle) _file.partOfBundle = partOfBundle
				if (outdated) _file.outdated = outdated

				if (!targetEpisode.files) targetEpisode.files = {}

				if (outdated || (targetEpisode.files && targetEpisode.files[variant])) {
					if (!targetEpisode.files.archived) targetEpisode.files.archived = []
					targetEpisode.files.archived.push(_file)
				} else {
					targetEpisode.files[variant] = _file
				}

				continue
			}

			for (const [i, file] of torrent.files.entries()) {
				const regex = new RegExp(`^.*(${arcTitle})(\s\d+)*`, 'i')
				const _match = file.name
					.replace('Whiskey', 'Whisky')
					.replace('Arabasta', 'Alabasta')
					.match(regex)

				let _arcTitle
				let _episodeNumber

				if (!_match || !_match[1] || !_match[2]) {
					_arcTitle = arcTitle
					_episodeNumber = i + 1
				} else {
					_arcTitle = _match[1]
						.replace('Wano Act', 'Wano')
						.replace('Whiskey', 'Whisky')
						.replace('Arabasta', 'Alabasta')
					_episodeNumber = _match[2] ? Number.parseInt(_match[2]) : null
				}

				if (arcTitle != _arcTitle) {
					Logger.warn(
						`Item Title does not match File name: '${arcTitle}' != '${_arcTitle}'`,
					)
				}

				const targetArc = buffer.arcs.find(a => a.title == _arcTitle)
				if (!targetArc) {
					Logger.warn(`Could not match '${_arcTitle}'`)
					continue
				}

				const targetEpisode = targetArc.episodes.find(e => {
					return e.episode == _episodeNumber
				})
				if (!targetEpisode) {
					Logger.warn(
						`Could not match '${_arcTitle}' episode ${_episodeNumber}`,
					)
					continue
				}

				if (outdated) {
					if (!targetEpisode.files) targetEpisode.files = {}
					if (!targetEpisode.files.archived) targetEpisode.files.archived = []

					const _file: RecursivePartial<FileMetadata> = {}

					//Punk Hazard 13 correction
					file.name = file.name.replace('316829437', '964FB36B')

					const crc32Match = file.name.match(/\[([A-Z0-9]{8})\]/)
					if (!crc32Match) {
						if (file.crc32) {
							_file.CRC32 = file.crc32
						} else {
							Logger.error(`Couldn't find CRC32 in file '${file.name}'`)
							continue
						}
					}
					_file.CRC32 = crc32Match[1]
					//Punk Hazard 13 correction
					if (crc32Match[1] == '964FB36B') _file.CRC32_inFileName = '316829437'
					_file.hash = infoHash
					_file.magnetURI = magnetURI
					_file.variant = variant
					if (torrent.files.length > 1) _file.partOfBundle = true
					if (outdated) _file.outdated = true

					targetEpisode.files.archived.push(_file)
				} else {
					if (
						targetEpisode.files &&
						targetEpisode.files[variant] &&
						targetEpisode.files[variant].magnetURI
							.replace(/.*btih\:/i, '')
							.replace(/\&.*/, '') != infoHash
					) {
						if (
							!targetEpisode.files[variant].partOfBundle &&
							torrent.files.length > 1
						) {
							Logger.debug(
								`Ignoring bundle for '${_arcTitle}' episode ${_episodeNumber}`,
							)
						} else
							Logger.error(
								`Tryng to overwrite '${_arcTitle}' episode ${_episodeNumber}`,
							)
					} else {
						if (!targetEpisode.files) targetEpisode.files = {}
						if (!targetEpisode.files[variant]) targetEpisode.files[variant] = {}

						//Punk Hazard 13 correction
						file.name = file.name.replace('316829437', '964FB36B')

						const crc32Match = file.name.match(/\[([A-Z0-9]{8})\]/)
						if (!crc32Match) {
							if (file.crc32) {
								targetEpisode.files[variant].CRC32 = file.crc32
							} else {
								Logger.error(`Couldn't find CRC32 in file '${file.name}'`)
								continue
							}
						} else targetEpisode.files[variant].CRC32

						//Punk Hazard 13 correction
						if (crc32Match[1] == '964FB36B')
							targetEpisode.files[variant].CRC32_inFileName = '316829437'
						targetEpisode.files[variant].hash = infoHash
						targetEpisode.files[variant].magnetURI = magnetURI
						targetEpisode.files[variant].variant = variant
						if (torrent.files.length > 1)
							targetEpisode.files[variant].partOfBundle = true
					}
				}
			}
		}

		return structuredClone(buffer)
	}

	private manualCorrections<T extends AllowedMetadata = Metadata>(metadata: T) {
		const manual: RecursivePartial<Metadata> = {
			arcs: [
				{
					arc: 0,
					episodes: [
						{
							episode: 2,
							description:
								'Having been propelled onto an unknown island by Luffy, Wapol experiences life as a homeless man for the first time. Eventually, he uses his Baku Baku powers to create unique toys by fusing different objects together and begins to work his way back up the social ladder by selling these toys to children. In the end, he opens his own shop and marries "Miss Universe" Kinderella.',
						},
						{
							episode: 3,
							description:
								'Three years before the beginning of the Golden Age of Piracy, word arrives at Marineford that Shiki and the Roger Pirates have made contact at Edd War in the New World. Monkey D. Garp, hearing the news, heads off with Sengoku to meet them.',
						},
						{
							episode: 4,
							description:
								'A series of shorts featuring the Straw Hats parodying various genres, such as fairy tales and science-fiction.',
						},
						{
							episode: 5,
							description: `This is a story of Luffy in an alternate reality. While sailing on the sea by himself, a strange bird crashes into his small boat. He looks up to find a giant ship where a girl named Anne has been captured. It seems like the bird belongs to her.`,
							files: {
								standard: {
									CRC32: '5E77445F',
									hash: '9a825f40a0a36882a51e221fff3e5b54d342f7f4',
									magnetURI:
										'magnet:?xt=urn:btih:9a825f40a0a36882a51e221fff3e5b54d342f7f4&dn=%5BOne%20Pace%5D%5BRomance%20Dawn%20v2%5D%20Romance%20Dawn%20v2%20%5B1080p%5D%5B5E77445F%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									variant: 'standard',
								},
							},
						},
						{
							episode: 6,
							description: `Luffy's team -- plus a stowaway -- sets out from Zou on their way to win back Sanji. Meanwhile, the leading families and leaders of the world make their way to the Holy Land, Mary Geoise, for a pivotal round table conference.`,
							files: {
								standard: {
									CRC32: 'EDB72EE5',
									//hash: '', //MISSING
									//magnetURI: '', //MISSING
									variant: 'standard',
								},
							},
						},
						{
							episode: 7,
							description: `The Straw Hats venture to the fabled "Treasure Island" to discover riches, adventure, and... strange creatures. Oh, and everything is in Klingon for some reason.`,
							files: {
								standard: {
									CRC32: 'EFF6059A',
									hash: '06b1f1e89dc70b3bd217cd656605ebd3ac5c983a',
									magnetURI:
										'magnet:?xt=urn:btih:06b1f1e89dc70b3bd217cd656605ebd3ac5c983a&dn=%5BOne%20Pace%5D%5B42%2C22%5D%20Gaimon%20%5B480p%5D%5BEFF6059A%5D&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									variant: 'standard',
								},
							},
						},
						{
							episode: 10,
							description: `The discovery of a small girl adrift in an abandoned life boat interrupts Luffy and crew's voyage to the Grand Line.`,
						},
					],
				},
			],
		}

		for (let arc_manual of manual.arcs) {
			const arc_in = metadata.arcs.find(a => a.arc == arc_manual.arc)
			if (!arc_in) continue

			for (let key of Object.keys(arc_in)) {
				if (key !== 'episodes' && key != 'arc') {
					arc_in[key] == arc_manual[key]
				}

				for (let ep_manual of arc_manual.episodes) {
					const ep_in = arc_in.episodes.find(
						e => e.episode == ep_manual.episode,
					)
					if (!ep_in) continue
					for (let key of Object.keys(ep_manual)) {
						if (key !== 'files' && key != 'episode') {
							ep_in[key] == ep_manual[key]
						}

						if (ep_manual.files)
							for (let file_manual of Object.keys(ep_manual.files)) {
								if (!ep_in.files) {
									//@ts-ignore
									ep_in.files = {}
								}
								ep_in.files[file_manual] = ep_manual.files[file_manual]
							}
					}
				}
			}
		}
	}

	private getPreProcessedMagnet(magnetUri: string): PreprocessedMagnet {
		try {
			if (!this.preProcessedMagnets)
				this.preProcessedMagnets = JSON.parse(
					readFileSync(PRE_PROCESSED_PATH).toString(),
				)

			return this.preProcessedMagnets.find(p => p.magnetURI == magnetUri)
		} catch (e) {
			Logger.error(`Could not load pre-processed magnetURIs`)
			Logger.error(e)
		}
	}
}

const PRE_PROCESSED_ROOT = './pre-processed'
const PRE_PROCESSED_PATH = `${PRE_PROCESSED_ROOT}/magnetURIs.json`

type AllowedMetadata = Metadata | RecursivePartial<Metadata>
