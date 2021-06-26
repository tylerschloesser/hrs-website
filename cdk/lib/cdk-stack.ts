import * as cdk from 'monocdk'
import {
  PublicHostedZone,
  ARecord,
  RecordTarget,
} from 'monocdk/lib/aws-route53'
import {
  Certificate,
  CertificateValidation,
} from 'monocdk/lib/aws-certificatemanager'
import { Distribution, ViewerProtocolPolicy } from 'monocdk/lib/aws-cloudfront'
import { S3Origin } from 'monocdk/lib/aws-cloudfront-origins'
import { CloudFrontTarget } from 'monocdk/lib/aws-route53-targets'

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const domainName = 'dev.haitianrelief.org'

    const bucket = new cdk.aws_s3.Bucket(this, 'Bucket', {
      bucketName: domainName.split('.').reverse().join('.'),
    })

    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: domainName,
    })

    const certificate = new Certificate(this, 'Certificate', {
      domainName,
      validation: CertificateValidation.fromDns(hostedZone),
    })

    const distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new S3Origin(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      domainNames: [domainName],
      certificate,
    })

    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    })
  }
}
