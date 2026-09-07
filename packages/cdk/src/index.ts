import * as cdk from 'aws-cdk-lib'
import { SharedStack } from './shared-stack.js'
import { SiteStack } from './site-stack.js'

const STAGES = ['sveltia', 'prod'] as const
type Stage = (typeof STAGES)[number]

const stage = process.env.STAGE?.toLowerCase()
if (!stage || !STAGES.includes(stage as Stage)) {
  throw Error(
    `STAGE must be set to one of ${STAGES.join(' | ')}, got: ${stage}`
  )
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const env = { account: '063257577013', region: 'us-east-1' }

const app = new cdk.App()

new SharedStack(app, 'OrgHaitianReliefShared', { env })

new SiteStack(app, `OrgHaitianRelief${capitalize(stage)}`, {
  env,
  stage,
})
