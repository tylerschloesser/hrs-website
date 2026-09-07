import * as cdk from 'aws-cdk-lib'
import { SiteStack } from './site-stack.js'

// One site, one domain, one stack, no stages.
//
// If a test environment is ever wanted again, add it as a *separate app*
// with its own domain rather than reintroducing a `STAGE` switch through
// every construct - the stage conditionals were the single biggest source of
// accidental complexity in the old stack.
const env = { account: '063257577013', region: 'us-east-1' }

// The apex zone is imported, never created: it predates this repo and holds
// the domain's registration. Creating it would mint new nameservers and take
// the domain off the internet.
const zone = {
  hostedZoneId: 'Z0010048114HS2EOWXJLC',
  zoneName: 'haitianrelief.org',
}

new SiteStack(new cdk.App(), 'HaitianReliefSite', { env, zone })
