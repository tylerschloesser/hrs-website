import { Stack, StackProps } from 'aws-cdk-lib'
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager'
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront'
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins'
import {
  ARecord,
  PublicHostedZone,
  RecordSet,
  RecordTarget,
  RecordType,
} from 'aws-cdk-lib/aws-route53'
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'
import {
  WEBPACK_MANIFEST_FILE_NAME,
  getDefaultRootObject,
} from './webpack-manifest'

const DIST_PATH = '../ui/dist'

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const domainName = `${process.env.STAGE}.haitianrelief.org`

    const bucket = new Bucket(this, 'Bucket', {
      bucketName: domainName.split('.').reverse().join('.'),
    })

    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: domainName,
    })

    const rootHostedZone = PublicHostedZone.fromLookup(this, 'RootHostedZone', {
      domainName: 'haitianrelief.org',
    })

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
      defaultRootObject: getDefaultRootObject(DIST_PATH),
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
      sources: [
        Source.asset(DIST_PATH, {
          exclude: [WEBPACK_MANIFEST_FILE_NAME],
        }),
      ],
      destinationBucket: bucket,
      distribution,
    })
  }
}
