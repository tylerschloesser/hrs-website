import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

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

    // Phase 3 placeholder: Sveltia CMS GitHub-OAuth Lambda + Function URL
    // (handles the CMS's GitHub OAuth flow for admin/ sign-in) goes here.
  }
}
