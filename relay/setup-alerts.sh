#!/bin/sh
# Sets up the relay's email about game versions FM Lens has no profile for, once:
# - the relay's role may send email from getfmlens.com with Amazon SES in SES_REGION (eu-west-1 by default), through
#   the configuration set fm-lens, which SES puts on every email from the domain;
# - POSTHOG_READ_KEY and ALERT_EMAIL join the relay's environment; the others stay as they are.
# Run it with AWS_PROFILE and AWS_REGION set for the relay's account and region, POSTHOG_READ_KEY set to a personal
# PostHog key that may only read queries of the FM Lens project, and ALERT_EMAIL to the address to tell. Deploy the
# relay after it (relay/deploy.sh). Running it again changes nothing that is already set.
set -eu
function=fm-lens-report-relay
ses_region="${SES_REGION:-eu-west-1}"
key="${POSTHOG_READ_KEY:?set POSTHOG_READ_KEY}"
to="${ALERT_EMAIL:?set ALERT_EMAIL}"
: "${AWS_REGION:?set AWS_REGION}"
account="$(aws sts get-caller-identity --query Account --output text)"
dir="$(mktemp -d)"
trap 'rm -r "$dir"' EXIT

role="$(aws lambda get-function-configuration --function-name "$function" --query Role --output text)"
cat >"$dir/role.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"ses:SendEmail",
"Resource":["arn:aws:ses:$ses_region:$account:identity/getfmlens.com",
"arn:aws:ses:$ses_region:$account:configuration-set/fm-lens"]}]}
JSON
aws iam put-role-policy --role-name "${role##*/}" --policy-name fm-lens-alerts \
  --policy-document "file://$dir/role.json"

umask 077
aws lambda get-function-configuration --function-name "$function" --query Environment --output json >"$dir/env.json"
POSTHOG_READ_KEY="$key" ALERT_EMAIL="$to" node -e '
  const fs = require("fs");
  const env = JSON.parse(fs.readFileSync(process.argv[1], "utf8")) ?? {};
  const { POSTHOG_READ_KEY, ALERT_EMAIL } = process.env;
  env.Variables = { ...env.Variables, POSTHOG_READ_KEY, ALERT_EMAIL };
  fs.writeFileSync(process.argv[1], JSON.stringify(env));
' "$dir/env.json"
aws lambda update-function-configuration --function-name "$function" --environment "file://$dir/env.json" \
  --query LastModified --output text
