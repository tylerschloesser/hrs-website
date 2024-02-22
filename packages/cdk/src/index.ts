import * as cdk from 'aws-cdk-lib'
import { CdkStack } from './cdk-stack.js'

const stage = process.env.STAGE?.toLowerCase()
if (!stage) {
  throw Error('STAGE not provided')
}
if (!['dev', 'staging', 'prod'].includes(stage)) {
  throw Error(`Invalid STAGE: ${stage}`)
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const app = new cdk.App()
new CdkStack(app, `OrgHaitianRelief${capitalize(stage)}`, {
  env: { account: '063257577013', region: 'us-east-1' },
})
