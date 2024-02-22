#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { CdkStack } from './cdk-stack'

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
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  env: { account: '063257577013', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
})
