import { CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class SharedStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // GitHub OIDC provider (account-wide singleton). Already exists;
    // must be imported, never created here.
    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`

    // GitHub Actions deploy role, shared across stages (sveltia + prod).
    // AdministratorAccess is a deliberate tradeoff here: the trust policy
    // (which repo/branch can assume this role) is the actual control, not
    // the permission set.
    const deployRole = new iam.Role(this, 'DeployRole', {
      roleName: 'hrs-website-deploy',
      assumedBy: new iam.WebIdentityPrincipal(oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            'repo:tylerschloesser/hrs-website:ref:refs/heads/main',
            'repo:tylerschloesser/hrs-website:ref:refs/heads/sveltia',
          ],
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    })

    new CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
    })

    // Sveltia CMS GitHub-OAuth Lambda + Function URL: handles the CMS's
    // GitHub OAuth flow for admin/ sign-in. See
    // packages/cdk/lambda/cms-auth/index.ts for the handler itself, a port
    // of https://github.com/sveltia/sveltia-cms-auth (MIT).
    //
    // The secret is created outside CloudFormation (by Tyler, via
    // `aws secretsmanager create-secret --name hrs/cms-auth ...`), so it's
    // imported here, never created.
    const cmsAuthSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'CmsAuthSecret',
      'hrs/cms-auth'
    )

    // Renaming this construct id changes the Function URL (it's derived
    // from the function's logical id), which breaks the GitHub OAuth App's
    // callback URL registration.
    const cmsAuthFunction = new NodejsFunction(this, 'CmsAuthFunction', {
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
        ALLOWED_DOMAINS: 'haitianrelief.org,sveltia.haitianrelief.org',
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

    new CfnOutput(this, 'CmsAuthUrl', {
      value: cmsAuthUrl,
    })
  }
}
