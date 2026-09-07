import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager'
import {
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import {
  ARecord,
  PublicHostedZone,
  RecordSet,
  RecordTarget,
  RecordType,
} from 'aws-cdk-lib/aws-route53'
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import {
  BucketDeployment,
  CacheControl,
  Source,
} from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'

const DIST_PATH = '../app/dist'

export interface SiteStackProps extends StackProps {
  stage: string
}

export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props)

    const { stage } = props
    const isProd = stage === 'prod'
    const domainName = `${stage}.haitianrelief.org`

    const bucket = new Bucket(this, 'Bucket', {
      bucketName: domainName.split('.').reverse().join('.'),
      ...(isProd
        ? {}
        : {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
          }),
    })

    const hostedZone = new PublicHostedZone(this, 'HostedZone', {
      zoneName: domainName,
    })

    const rootHostedZone = PublicHostedZone.fromLookup(this, 'RootHostedZone', {
      domainName: 'haitianrelief.org',
    })

    const certificate = isProd
      ? new Certificate(this, 'Certificate', {
          domainName,
          subjectAlternativeNames: ['haitianrelief.org'],
          validation: CertificateValidation.fromDnsMultiZone({
            [domainName]: hostedZone,
            'haitianrelief.org': rootHostedZone,
          }),
        })
      : new Certificate(this, 'Certificate', {
          domainName,
          validation: CertificateValidation.fromDns(hostedZone),
        })

    const domainNames = isProd
      ? [domainName, 'haitianrelief.org']
      : [domainName]

    // Astro builds with `build.format: 'file'`, so pages are emitted as
    // `<name>.html` and almost every URL already carries an extension. This
    // function exists for the directories that remain: it makes `/admin` and
    // `/admin/` both resolve to `admin/index.html`, and it keeps any future
    // directory-shaped path working without the viewer typing `index.html`.
    const urlRewriteFunction = new CloudFrontFunction(
      this,
      'UrlRewriteFunction',
      {
        runtime: FunctionRuntime.JS_2_0,
        code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request
  var uri = request.uri

  if (uri.endsWith('/')) {
    request.uri += 'index.html'
  } else {
    var lastSegment = uri.split('/').pop()
    if (lastSegment.indexOf('.') === -1) {
      request.uri += '/index.html'
    }
  }

  return request
}
`),
      }
    )

    const responseHeadersPolicy = new ResponseHeadersPolicy(
      this,
      'ResponseHeadersPolicy',
      {
        responseHeadersPolicyName: `hrs-website-security-headers-${stage}`,
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
          contentTypeOptions: { override: true },
          referrerPolicy: {
            referrerPolicy:
              HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          frameOptions: {
            frameOption: HeadersFrameOption.DENY,
            override: true,
          },
          // No CSP yet - Phase 5 may add one.
        },
        ...(isProd
          ? {}
          : {
              // Belt-and-suspenders alongside robots.txt: make sure the
              // test domain can never be indexed.
              customHeadersBehavior: {
                customHeaders: [
                  {
                    header: 'X-Robots-Tag',
                    value: 'noindex, nofollow',
                    override: true,
                  },
                ],
              },
            }),
      }
    )

    const distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: urlRewriteFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
        responseHeadersPolicy,
      },
      defaultRootObject: 'index.html',
      domainNames,
      certificate,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
        },
      ],
    })

    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    })

    if (isProd) {
      new ARecord(this, 'RootAliasRecord', {
        zone: rootHostedZone,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      })
    }

    new RecordSet(this, 'NsRecord', {
      recordName: hostedZone.zoneName,
      recordType: RecordType.NS,
      target: RecordTarget.fromValues(...hostedZone.hostedZoneNameServers!),
      zone: rootHostedZone,
    })

    // Hashed, immutable assets go first so that by the time the HTML
    // deployment lands (and invalidates the distribution), every asset the
    // new HTML references is already in the bucket.
    const assetsDeployment = new BucketDeployment(this, 'AssetsDeployment', {
      sources: [Source.asset(DIST_PATH)],
      destinationBucket: bucket,
      include: ['_astro/*'],
      exclude: ['*'],
      cacheControl: [
        CacheControl.fromString('public, max-age=31536000, immutable'),
      ],
      prune: false,
      memoryLimit: 256,
    })

    // `aws s3 sync --delete` applies `--exclude` to the destination too, so
    // excluding `_astro/*` here also protects it from this deployment's
    // prune - it can only ever delete stale HTML/other non-asset files.
    const htmlDeployment = new BucketDeployment(this, 'HtmlDeployment', {
      sources: [Source.asset(DIST_PATH)],
      destinationBucket: bucket,
      exclude: ['_astro/*'],
      cacheControl: [
        CacheControl.fromString('public, max-age=0, must-revalidate'),
      ],
      prune: true,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 256,
    })

    htmlDeployment.node.addDependency(assetsDeployment)
  }
}
