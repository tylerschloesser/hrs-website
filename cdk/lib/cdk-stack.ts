import * as cdk from 'monocdk'
import { PublicHostedZone } from 'monocdk/lib/aws-route53'

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const bucket = new cdk.aws_s3.Bucket(this, 'Bucket', {
      bucketName: 'dev.haitianrelief.org',
    })

    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: 'dev.haitianrelief.org',
    })

    // The code that defines your stack goes here
  }
}
