import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib'
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
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch'
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions'
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
import { Topic } from 'aws-cdk-lib/aws-sns'
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions'
import {
  Canary,
  Code,
  Runtime,
  Schedule,
  Test,
} from 'aws-cdk-lib/aws-synthetics'
import { Construct } from 'constructs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

    // Delegate the stage subdomain from the apex zone. ACM's DNS validation
    // resolves its CNAME over public DNS, so this has to exist first or the
    // certificate sits pending for the better part of an hour.
    const nsRecord = new RecordSet(this, 'NsRecord', {
      recordName: hostedZone.zoneName,
      recordType: RecordType.NS,
      target: RecordTarget.fromValues(...hostedZone.hostedZoneNameServers!),
      zone: rootHostedZone,
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

    certificate.node.addDependency(nsRecord)

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
          // No CSP, decided in Phase 5. Every script that matters here is
          // inline: the Google Tag Manager bootstrap, GTM's own injected
          // tags, and Sveltia's loader on /admin. A static S3 origin cannot
          // mint a per-request nonce without adding Lambda@Edge, so any
          // policy we could ship would need `unsafe-inline` for scripts -
          // which is the one thing a CSP is worth having for. Revisit only
          // if the inline GTM snippet goes away.
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

    // Daily canary (Phase 5 step 2). One topic per stage - an SNS email
    // subscription has to be confirmed by clicking a link in a "Subscription
    // Confirmation" email, once per topic. So standing up a new stage always
    // means a new confirmation email, and until someone clicks it that
    // stage's alarm emails go nowhere. This lands again at prod cutover.
    const alertsTopic = new Topic(this, 'AlertsTopic', {
      topicName: `hrs-${stage}-alerts`,
      displayName: `HRS ${stage} alerts`,
    })
    alertsTopic.addSubscription(
      new EmailSubscription('tylerschloesser@gmail.com')
    )

    // The `Canary` construct's default artifacts bucket has no
    // `removalPolicy`, which means CDK's S3 default (RETAIN) applies: it
    // wouldn't block `cdk destroy`, but it would orphan a bucket on every
    // non-prod teardown (Phase 6 destroys this whole stack for `sveltia`).
    // Build it explicitly instead, mirroring the site `bucket` above, so
    // non-prod cleans up completely and prod keeps its run history.
    //
    // The 30-day expiration lives here, not in the canary's own
    // `artifactsBucketLifecycleRules` prop below: that prop is documented as
    // "has no effect if a bucket is passed to `artifactsBucketLocation`",
    // which this does, so the lifecycle rule has to go directly on the
    // bucket or it is silently dropped.
    const canaryArtifactsBucket = new Bucket(this, 'CanaryArtifactsBucket', {
      lifecycleRules: [{ expiration: Duration.days(30) }],
      ...(isProd
        ? {}
        : {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
          }),
    })

    // `canaryName` must be lowercase letters/numbers/hyphens, <=21 chars:
    // `hrs-sveltia-daily` is 17, `hrs-prod-daily` is 14.
    const canary = new Canary(this, 'Canary', {
      canaryName: `hrs-${stage}-daily`,
      // Newest Playwright runtime aws-cdk-lib 2.268.0 exposes. The account
      // supports newer (syn-nodejs-playwright-8.0), but CDK can only select
      // a runtime it has an enum value for.
      runtime: Runtime.SYNTHETICS_NODEJS_PLAYWRIGHT_6_0,
      test: Test.custom({
        code: Code.fromAsset(join(__dirname, '../canary')),
        handler: 'index.handler',
      }),
      schedule: Schedule.cron({ minute: '0', hour: '13' }), // ~08:00 Central
      environmentVariables: {
        SITE_URL: `https://${domainName}`,
      },
      artifactsBucketLocation: { bucket: canaryArtifactsBucket },
      startAfterCreation: true,
      // Comfortably above the script's 30s navigation timeout, to leave
      // room for browser launch plus the assertion/screenshot steps.
      timeout: Duration.seconds(60),
      // `Cleanup.LAMBDA` is deprecated in this CDK version in favor of
      // this boolean; both do the same thing (remove the canary's Lambda
      // when the canary itself is destroyed) but the construct throws if
      // both are set, so use only the current one.
      provisionedResourceCleanup: true,
    })

    // `metricSuccessPercent()`'s own default is "avg over 5 minutes"; a
    // once-a-day canary needs the period widened to match its schedule, or
    // the alarm would see 23:55 of "no data" for every 5 minutes it didn't
    // run and immediately breach (`treatMissingData: BREACHING`, below).
    // Average is the natural statistic for a percentage - there's only ever
    // one data point per period, so avg/min/max are identical here.
    const canarySuccessMetric = canary.metricSuccessPercent({
      period: Duration.days(1),
      statistic: 'Average',
    })

    const canaryAlarm = new Alarm(this, 'CanaryAlarm', {
      alarmName: `hrs-${stage}-daily-canary`,
      alarmDescription: `The ${domainName} daily canary (hrs-${stage}-daily) failed, or didn't run. Check its latest run in the CloudWatch Synthetics console before assuming the site itself is down.`,
      metric: canarySuccessMetric,
      threshold: 100,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      // A canary that silently stops running (budget cut off, schedule
      // disabled, the account hitting a Synthetics limit) is exactly the
      // kind of failure a "did it alarm?" check should catch - so missing
      // data counts as a failure, not a pass.
      treatMissingData: TreatMissingData.BREACHING,
    })
    canaryAlarm.addAlarmAction(new SnsAction(alertsTopic))
    // Both directions go to the same topic so a recovery is emailed too -
    // otherwise the only way to know it's fixed is to go check.
    canaryAlarm.addOkAction(new SnsAction(alertsTopic))

    new CfnOutput(this, 'CanaryName', {
      value: canary.canaryName,
    })

    new CfnOutput(this, 'AlertsTopicArn', {
      value: alertsTopic.topicArn,
    })
  }
}
