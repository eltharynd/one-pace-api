import dotenv from 'dotenv'
import { Logger } from 'ez-ts-logger'
dotenv.config({ path: './.env' })

export default {
	LOG_LEVEL: process.env.LOG_LEVEL || 'info',
	DEBUGGING:
		/debug/i.test(process.env.LOG_LEVEL || 'false') ||
		/true/i.test(process.env.DEBUGGING || 'false'),

	TESTING:
		/test/i.test(process.env.NODE_ENV) || /true/i.test(process.env.TESTING),

	DOMAIN: process.env.DOMAIN || 'localhost',
	API_BASE: process.env.API_BASE || '/api/v1/',
	PORT: Number.parseInt(process.env.PORT || '3000'),

	GOOGLE_DEVELOPER_MODE: /true/i.test(process.env.GOOGLE_DEVELOPER_MODE),
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
	GOOGLE_SHEET_EPISODE_GUIDE: process.env.GOOGLE_SHEET_EPISODE_GUIDE || '',
	GOOGLE_SHEET_EPISODE_DESCRIPTION:
		process.env.GOOGLE_SHEET_EPISODE_DESCRIPTION || '',
}

Logger.reloadEnvConfigs()
