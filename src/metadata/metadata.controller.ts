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
import { Context } from '../util/context.js'
import {
	ArcMetadata,
	EpisodeFilesMetadata,
	EpisodeMetadata,
	Metadata,
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

	async init(): Promise<void> {
		if (existsSync(METADATA_OUTPUT) && !environment.FORCE_REGENERATION) {
			try {
				Logger.debug(`Checking metadata from cache`)
				this.metadata = JSON.parse(readFileSync(METADATA_OUTPUT).toString())

				const lastRSSUpdate: Date = await Context.rss.getLastUdate()
				const lastScraperUpdate: Date = await Context.scraper.getLastUdate()
				const lastUpdate: Date = new Date(this.metadata.lastUpdate)
				if (lastRSSUpdate > lastUpdate || lastScraperUpdate > lastUpdate) {
					Logger.info(`Remote updates, renewing cached metadata...`)
					this.metadata = await this.process()
					Logger.debug(`Notifying sockets`)
					Context.express.io
						.to('updates')
						.emit('updates', Context.metadata.getAll())
				} else {
					Logger.info('Loaded Metadata from cache')
				}
			} catch (e) {
				Logger.warn('Badly formed cached metadata, reprocessing')
				this.metadata = await this.process()
				Logger.debug(`Notifying sockets`)
				Context.express.io
					.to('updates')
					.emit('updates', Context.metadata.getAll())
			}
		} else {
			Logger.debug(
				`Processing Metadata from remote sources${environment.FORCE_REGENERATION ? ' [Forced]' : ''}`,
			)
			this.metadata = await this.process()
			Logger.info(
				`Processed Metadata from remote sources${environment.FORCE_REGENERATION ? ' [Forced]' : ''}`,
			)
			Logger.debug(`Notifying sockets`)
			if (Context.express?.io)
				Context.express.io
					.to('updates')
					.emit('updates', Context.metadata.getAll())
		}
	}

	getAll(): Metadata {
		return structuredClone(this.metadata)
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
		let guide = Context.scraper.getEpisodeGuide()
		let descriptions = Context.scraper.getEpisodeDescriptions()

		let buffer: RecursivePartial<Metadata> = {
			arcs: [],
		}

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
						title: String(row[1]).replace(/\ *\(.*\).*$/, ''),

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

		const arcsSheet = descriptions.sheets.find(s => /arcs/i.test(s.title))
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
						title: String(row[0]),
						description: String(row[2]),

						status: 'complete',

						episodes: [],
					}
					buffer.arcs.push(arc)
				} else continue
			}

			Logger.debug(`Processing ${row[2]} Arc Descriptions`)
			arc.saga = String(row[0])
			arc.title = String(row[2])
			arc.description = String(row[3])
		}

		const episodesSheet = descriptions.sheets.find(s =>
			/episodes/i.test(s.title),
		)
		for (let [index, row] of episodesSheet.rows.entries()) {
			if (/arc_title/i.test(String(row[0])) || !row[0]) continue

			Logger.debug(
				`Processing '${String(row[0])} - ${String(row[1])}' Episode Descriptions`,
			)

			let arc: RecursivePartial<ArcMetadata> = buffer.arcs.find(
				a =>
					a.title == String(row[0]).replace('One Piece Fan Letter', 'Specials'),
			)

			if (arc) {
				let episode = arc.episodes.find(
					e =>
						e.episode ==
						(String(row[0]) == 'One Piece Fan Letter'
							? 0
							: Number.parseInt(String(row[1]))),
				)

				if (episode) {
					if (!row[2]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' title is still empty`,
						)
						episode.title = `${String(row[0])} - ${String(row[1])}`
					} else episode.title = String(row[2])

					if (!row[3]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' description is still empty`,
						)
					} else episode.description = String(row[3])
				} else {
					if (arc.arc == 0 && row[1]) {
						const episode: RecursivePartial<EpisodeMetadata> = {
							arc: 0,
							episode:
								String(row[0]) == 'One Piece Fan Letter' ? 0 : Number(row[1]),
						}

						if (row[2]) episode.title = String(row[2])
						if (row[3]) episode.description = String(row[3])

						arc.episodes.push(episode)
					} else if (row[1] && row[2] && row[3]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' from descriptions not found in guide but has descriptions. Adding...`,
						)
						arc.episodes.push({
							episode: Number(row[1]),
							title: String(row[2]),
							description: String(row[3]),
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

	private manualCorrections(metadata: Metadata) {
		const manual: RecursivePartial<Metadata> = {
			arcs: [
				{
					arc: 0,
					episodes: [
						{
							episode: 0,
							files: {
								standard: {
									CRC32: '9974A092',
									hash: '89913d954cec1c03a50667b81bc2b9508c4f2214',
									magnetURI:
										'magnet:?xt=urn:btih:89913d954cec1c03a50667b81bc2b9508c4f2214&dn=%5BOne%20Pace%5D%20One%20Piece%20Fan%20Letter%20%5B1080p%5D%5B9974A092%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									duration: 24 * 60,
								},
							},
						},
						{
							episode: 2,
							files: {
								standard: {
									CRC32: '415455AE',
									hash: 'db52460eabf9592e3188f2f239b1c9c4603a7c59',
									magnetURI:
										'magnet:?xt=urn:btih:db52460eabf9592e3188f2f239b1c9c4603a7c59&dn=%5BOne%20Pace%5D%20Straw%20Hat%20Theatre%20%5B720p%5D%5B415455AE%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									duration: 17 * 60,
								},
							},
						},
						{
							episode: 4,
							files: {
								standard: {
									CRC32: '05BE81E6',
									hash: '2cbbeef2c6c5597ef09c8659ee8d541e6d2be371',
									magnetURI:
										'magnet:?xt=urn:btih:2cbbeef2c6c5597ef09c8659ee8d541e6d2be371&dn=%5BOne%20Pace%5D%5BCover%20236-262%5D%20Wapol%27s%20Omnivorous%20Hurrah%20%5B720p%5D%5B05BE81E6%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									duration: 2 * 60,
								},
							},
						},
						{
							episode: 7,
							files: {
								standard: {
									CRC32: 'EFF6059A',
									hash: '06b1f1e89dc70b3bd217cd656605ebd3ac5c983a',
									magnetURI:
										'magnet:?xt=urn:btih:06b1f1e89dc70b3bd217cd656605ebd3ac5c983a&dn=%5BOne%20Pace%5D%5B42%2C22%5D%20Gaimon%20%5B480p%5D%5BEFF6059A%5D&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									duration: 20 * 60,
								},
							},
						},
						{
							episode: 9,
							files: {
								standard: {
									CRC32: '2F71D53E',
									hash: 'e513256e0e4f24fc950dd5c1aec9a38c9e5a75d2',
									magnetURI:
										'magnet:?xt=urn:btih:e513256e0e4f24fc950dd5c1aec9a38c9e5a75d2&dn=%5BOne%20Pace%5D%5B199-201%5D%20Arabasta%2016%20-%20April%20Fools%20%5B1080p%5D%5B2F71D53E%5D&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									duration: 18 * 60,
								},
							},
						},
						{
							episode: 10,
							files: {
								standard: {
									CRC32: 'B4925314',
									hash: '77ba0dd87a00cf4216648bb79b7206e8549686c0',
									magnetURI:
										'magnet:?xt=urn:btih:77ba0dd87a00cf4216648bb79b7206e8549686c0&dn=%5BOne%20Pace%5D%20Warship%20Island%2001%20%28April%20Fools%202025%29%20%5B1080p%5D%5BB4925314%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce',
									duration: 24 * 60,
								},
							},
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
}
