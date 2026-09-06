I want to migrate this simple non-profit static website to https://sveltiacms.app/en/docs/intro so the admin(s) can make changes without my involvement.

Note their docs on AI: https://sveltiacms.app/en/docs/working-with-ai

I also want to couple with with a few things:
Get off of webpack, handlebars, semantic UI.
use pnpm
Keep using CDK
Simplify pipeline. We don't need a staging environment. Pointless.
Simplify testing. Add a canary test to run once a day and email me if it fails. No need for a full test suite.
New stack should handle image optimization - currently there's a lot of manual effort in that bullshit.
Basic SEO improvements - meta tags, sitemap, robots.txt, etc.

Re-implement the UI. Research options that pair well with Sveltia. Keep the same structure & copy - but modernize the look and feel. Keep responsiveness and a11y.
Keep the image gallery functionality, but maybe improve. Images should be able to be managed via CMS. Note that right now we load thumbnails and the lightbox loads the full image - should try to keep this.
Need a better menu - mine sucks ass (e.g. hamburger on mobile).
Need a better color palette. Research a simple pallette I can adopt that's not drastically different (my current pallete is basically blue, white and black).

plan should break the work into phases, with clear deliverables for each phase.
Each phase should delegate as much as possible to sonnet sub-agents
After each phase, everything should be committed and pushed and verified as much as possible. I will just be involved to verify, clear the context, and start the next phase. To that end, Claude needs to ensure that all context is written such that the next phase can start with a fresh context.

Goal of this session is to research the missing pieces and write a plan to docs/migration-plan.md.

Note that im currently on main, and the prompt is uncommitted. All future work should happen on a new branch: sveltia. Claude should automatically commit and push frequently.
The new branch should deploy to a test domain for verification before going live. e.g. sveltia.haitianrelief.org
Last phase should backup main (call it semantic-ui), push that to git so it's saved, then merge sveltia into main and verify that haitianrelief.org is the new site. Then delete the sveltia branch and the test domain/stack.

Note that w.r.t to the migration, the only thing I really need to keep is the content and the images. Everything else can be re-implemented. In fact, beyond what I've written here, it should be ignored because it's quite outdated.
