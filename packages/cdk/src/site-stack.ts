import { CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib'
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
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch'
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions'
import {
  ARecord,
  HostedZone,
  HostedZoneAttributes,
  RecordTarget,
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

const DIST_PATH = join(__dirname, '../../app/dist')

export interface SiteStackProps extends StackProps {
  /** The apex zone, imported by attributes - never created. */
  zone: HostedZoneAttributes
}

export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props)

    const domainName = props.zone.zoneName

    // The site is served from the apex and nowhere else, so there is no NS
    // delegation to wait on before ACM can validate - validation happens
    // directly in the zone that already answers for the domain.
    const hostedZone = HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      props.zone
    )

    const bucket = new Bucket(this, 'Bucket', {
      bucketName: domainName.split('.').reverse().join('.'),
    })

    const certificate = new Certificate(this, 'Certificate', {
      domainName,
      validation: CertificateValidation.fromDns(hostedZone),
    })

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
        responseHeadersPolicyName: 'hrs-website-security-headers',
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
          // No CSP, on purpose. Every script that matters here is
          // inline: the Google Tag Manager bootstrap, GTM's own injected
          // tags, and Sveltia's loader on /admin. A static S3 origin cannot
          // mint a per-request nonce without adding Lambda@Edge, so any
          // policy we could ship would need `unsafe-inline` for scripts -
          // which is the one thing a CSP is worth having for. Revisit only
          // if the inline GTM snippet goes away.
        },
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
      domainNames: [domainName],
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

    // An SNS email subscription has to be confirmed by clicking a link in a
    // "Subscription Confirmation" email, once per topic. Recreating this
    // topic - including renaming the stack it lives in - means a new
    // confirmation email, and until someone clicks it the alarm below emails
    // nobody. `aws sns list-subscriptions` shows `PendingConfirmation` until
    // then; it is worth checking after any change here.
    const alertsTopic = new Topic(this, 'AlertsTopic', {
      topicName: 'hrs-alerts',
      displayName: 'HRS alerts',
    })
    alertsTopic.addSubscription(
      new EmailSubscription('tylerschloesser@gmail.com')
    )

    // Built explicitly (rather than left to the `Canary` construct's default
    // artifacts bucket) so the 30-day expiration below has somewhere to live:
    // the canary's own `artifactsBucketLifecycleRules` prop is documented as
    // "has no effect if a bucket is passed to `artifactsBucketLocation`",
    // which this does, so the lifecycle rule has to go directly on the
    // bucket or it is silently dropped.
    const canaryArtifactsBucket = new Bucket(this, 'CanaryArtifactsBucket', {
      lifecycleRules: [{ expiration: Duration.days(30) }],
    })

    // `canaryName` must be lowercase letters/numbers/hyphens, <=21 chars.
    const canary = new Canary(this, 'Canary', {
      canaryName: 'hrs-daily',
      // Newest Playwright runtime aws-cdk-lib 2.268.0 exposes. The account
      // supports newer (syn-nodejs-playwright-8.0), but CDK can only select
      // a runtime it has an enum value for.
      runtime: Runtime.SYNTHETICS_NODEJS_PLAYWRIGHT_6_0,
      test: Test.custom({
        code: Code.fromAsset(join(__dirname, '../canary')),
        handler: 'index.handler',
      }),
      schedule: Schedule.cron({ minute: '0', hour: '13' }), // 8am/9am Central (CDT/CST)
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

    // Note that a freshly created canary has no datapoints until its first
    // scheduled run, and `BREACHING` means "no data is a failure" - so this
    // alarm is born in ALARM and stays there until 13:00 UTC. That is
    // correct behaviour, not a fault. To settle it immediately, force one
    // run: stop the canary, `update-canary --schedule
    // Expression='rate(0 minute)'`, start it, then restore
    // `cron(0 13 * * ? *)` with `DurationInSeconds=0`.
    const canaryAlarm = new Alarm(this, 'CanaryAlarm', {
      alarmName: 'hrs-daily-canary',
      alarmDescription: `The ${domainName} daily canary (hrs-daily) failed, or didn't run. Check its latest run in the CloudWatch Synthetics console before assuming the site itself is down.`,
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

    // --- CI credentials -------------------------------------------------
    //
    // CI deploys the stack that grants CI its own credentials. If a bad
    // change to this role ever lands, the fix is a local
    // `AWS_PROFILE=admin pnpm run deploy`, not another push.

    // GitHub OIDC provider (account-wide singleton, shared with unrelated
    // projects in this account). Imported by ARN; never created here.
    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`

    // AdministratorAccess is a deliberate tradeoff: the trust policy (which
    // repo and branch may assume this role) is the actual control, not the
    // permission set. Only `main` deploys.
    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'hrs-website-deploy',
      assumedBy: new iam.WebIdentityPrincipal(oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub':
            'repo:tylerschloesser/hrs-website:ref:refs/heads/main',
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    })

    // --- Sveltia CMS sign-in ---------------------------------------------
    //
    // Handles the CMS's GitHub OAuth code-for-token exchange. See
    // packages/cdk/lambda/cms-auth/index.ts, a port of
    // https://github.com/sveltia/sveltia-cms-auth (MIT).
    //
    // The secret is created outside CloudFormation (by Tyler, via
    // `aws secretsmanager create-secret --name hrs/cms-auth ...`), so it is
    // imported here and `cdk destroy` can never delete it.
    const cmsAuthSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'CmsAuthSecret',
      'hrs/cms-auth'
    )

    // `functionName` is pinned on purpose. A Function URL's hostname is
    // derived from the function's *name*, and an unnamed CDK function is
    // named after the stack that holds it - so the 2026-09 stack rename
    // would have silently changed the sign-in URL, and every future rename
    // would do it again. Pinning the name decouples the URL from the stack.
    //
    // If this name ever does change, two things outside CloudFormation have
    // to change with it or sign-in breaks with no error in any AWS log:
    // the GitHub OAuth App's callback (`<url>/callback`), and the
    // `CMS_AUTH_URL` Actions variable (`gh variable set CMS_AUTH_URL`),
    // which is what `config.yml.ts` compiles into `base_url`.
    const cmsAuthFunction = new NodejsFunction(this, 'CmsAuthFunction', {
      functionName: 'hrs-cms-auth',
      entry: join(__dirname, '../lambda/cms-auth/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      architecture: lambda.Architecture.ARM_64,
      depsLockFilePath: join(__dirname, '../../../pnpm-lock.yaml'),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup: new LogGroup(this, 'CmsAuthFunctionLogs', {
        retention: RetentionDays.ONE_MONTH,
      }),
      environment: {
        // The allow-list of sites that may start the sign-in flow. A new
        // domain has to be added here or sign-in fails.
        ALLOWED_DOMAINS: domainName,
        CMS_AUTH_SECRET_NAME: 'hrs/cms-auth',
      },
    })

    cmsAuthSecret.grantRead(cmsAuthFunction)

    const cmsAuthFunctionUrl = cmsAuthFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      // No CORS: the flow is top-level redirects and postMessage, not XHR.
    })

    // The GitHub OAuth App's callback URL must be `<CmsAuthUrl>/callback`.
    // Function URLs always end in a trailing slash, but Sveltia builds
    // `${base_url}/auth`, so strip it here rather than at every call site.
    // `.url` is a CloudFormation token (an opaque placeholder string
    // resolved only at deploy time), so ordinary JS string methods like
    // `.replace()` would silently corrupt it; `Fn.select`/`Fn.split` are
    // token-safe intrinsic-function calls that CloudFormation itself
    // evaluates on the resolved value.
    const cmsAuthUrl = `https://${Fn.select(0, Fn.split('/', Fn.select(1, Fn.split('//', cmsAuthFunctionUrl.url))))}`

    new CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
    })

    new CfnOutput(this, 'CmsAuthUrl', {
      value: cmsAuthUrl,
    })

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${domainName}`,
    })

    new CfnOutput(this, 'CanaryName', {
      value: canary.canaryName,
    })

    new CfnOutput(this, 'AlertsTopicArn', {
      value: alertsTopic.topicArn,
    })
  }
}
