import { Logger } from 'ez-ts-logger'
import { mkdirSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Body, Controller, Get, Post, UseBefore } from 'routing-controllers'
import { simpleGit } from 'simple-git'
import environment from '../../environment.js'
import { Context } from '../../util/context.js'
import { OkResponse } from '../interceptors/default.interceptor.js'
import { AdminGuard } from '../middlewares/auth.middleware.js'

const FORCE_UPDATES_DELAY = 300_000
const PRE_PROCESSED_ROOT = './pre-processed'
const PRE_PROCESSED_TORRENTS = `${PRE_PROCESSED_ROOT}/torrents.json`

const REPO_DIR = './tmp/git-repo'
const REPO_PRE_PROCESSED_PATH = `${REPO_DIR}${PRE_PROCESSED_TORRENTS.replace('./', '/')}`
const BRANCH = 'main'

@Controller(`/admin`)
export class AdminController {
	@Get(`/update/force`)
	@UseBefore(AdminGuard)
	forceUpdate() {
		if (Context.express.isLeader) {
			Context.metadata.init(true)
		} else {
			Context.express.io.serverSideEmit('forced_update')
		}
		return new OkResponse()
	}

	@Post(`/update/processed-torrents`)
	@UseBefore(AdminGuard)
	updateProcessedTorrents(@Body() body: any) {
		writeFileSync(PRE_PROCESSED_TORRENTS, JSON.stringify(body, null, 2))

		return new OkResponse()
	}

	private async commitChanges() {
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

			mkdirSync(path.dirname(REPO_PRE_PROCESSED_PATH), { recursive: true })
			//copyFileSync(REP, REPO_PRE_PROCESSED_PATH)

			Logger.debug(`git add -f ${REPO_PRE_PROCESSED_PATH}`)
			await git.add(['-f', REPO_PRE_PROCESSED_PATH])

			Logger.debug(`git status --ignored`)
			const status = await git.status(['--ignored'])
			if (status.staged.length === 0) {
				Logger.warn('No changes to commit')
				return
			}

			Logger.debug(`Committing`)
			await git.commit(
				`Chore: Torrents pre-processing updates`,
				REPO_PRE_PROCESSED_PATH,
			)
			Logger.debug(`Pushing`)
			await git.push('origin', BRANCH)

			Logger.info(`Committed changes to repo`)
		} catch (e) {
			Logger.errorAndThrow(e)
		}
	}
}
