import * as cdk from 'monocdk'
import {
  Certificate,
  CertificateValidation,
} from 'monocdk/lib/aws-certificatemanager'
import { Distribution, ViewerProtocolPolicy } from 'monocdk/lib/aws-cloudfront'
import { S3Origin } from 'monocdk/lib/aws-cloudfront-origins'
import {
  ARecord,
  IHostedZone,
  PublicHostedZone,
  RecordSet,
  RecordTarget,
  RecordType,
} from 'monocdk/lib/aws-route53'
import { CloudFrontTarget } from 'monocdk/lib/aws-route53-targets'
import { BucketDeployment, Source } from 'monocdk/lib/aws-s3-deployment'

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const domainName = `${process.env.STAGE}.haitianrelief.org`

    const bucket = new cdk.aws_s3.Bucket(this, 'Bucket', {
      bucketName: domainName.split('.').reverse().join('.'),
    })

    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: domainName,
    })

    let rootHostedZone: IHostedZone

    if (process.env.STAGE === 'prod') {
      rootHostedZone = new PublicHostedZone(this, 'RootHostedZone', {
        zoneName: 'haitianrelief.org',
      })
    } else {
      rootHostedZone = PublicHostedZone.fromLookup(this, 'RootHostedZone', {
        domainName: 'haitianrelief.org',
      })
    }

    let certificate: Certificate
    if (process.env.STAGE === 'prod') {
      certificate = new Certificate(this, 'Certificate', {
        domainName,
        subjectAlternativeNames: ['haitianrelief.org'],
        validation: CertificateValidation.fromDnsMultiZone({
          [domainName]: hostedZone,
          'haitianrelief.org': rootHostedZone!,
        }),
      })
    } else {
      certificate = new Certificate(this, 'Certificate', {
        domainName,
        validation: CertificateValidation.fromDns(hostedZone),
      })
    }

    const domainNames = [domainName]
    if (process.env.STAGE === 'prod') {
      domainNames.push('haitianrelief.org')
    }

    const distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new S3Origin(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      domainNames,
      certificate,
    })

    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    })

    if (process.env.STAGE === 'prod') {
      new ARecord(this, 'RootAliasRecord', {
        zone: rootHostedZone!,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      })
    }

    new RecordSet(this, 'NsRecord', {
      recordName: hostedZone.zoneName,
      recordType: RecordType.NS,
      target: RecordTarget.fromValues(...hostedZone.hostedZoneNameServers!),
      zone: rootHostedZone,
    })

    new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.asset('../ui/dist')],
      destinationBucket: bucket,
      distribution,
    })
  }
}
