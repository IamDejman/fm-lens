#!/bin/sh
# Sets up FM Lens's email list and the relay's schedule, once:
# - the DynamoDB table of addresses, fm-lens-subscribers, kept recoverable for 35 days, which the relay's role may
#   update and count;
# - getfmlens.com as a sender in Amazon SES in SES_REGION (eu-west-1 by default, where the account may send to anyone),
#   with its own configuration set, fm-lens;
# - an EventBridge schedule that runs the relay with `{ "job": "report-counts" }` every 15 minutes, to send PostHog the
#   download counts and the list's size.
# It prints the DNS records getfmlens.com needs for SES. Run it with AWS_PROFILE and AWS_REGION set for the relay's
# account and region. Running it again changes nothing that is already set.
set -eu
function=fm-lens-report-relay
table="${SUBSCRIBERS_TABLE:-fm-lens-subscribers}"
ses_region="${SES_REGION:-eu-west-1}"
domain=getfmlens.com
region="${AWS_REGION:?set AWS_REGION}"
account="$(aws sts get-caller-identity --query Account --output text)"
dir="$(mktemp -d)"
trap 'rm -r "$dir"' EXIT

# The list.
if ! aws dynamodb describe-table --table-name "$table" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$table" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=email,AttributeType=S --key-schema AttributeName=email,KeyType=HASH \
    --query TableDescription.TableStatus --output text
  aws dynamodb wait table-exists --table-name "$table"
fi
aws dynamodb update-continuous-backups --table-name "$table" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null

# The relay puts addresses on the list, takes them off and counts them.
role="$(aws lambda get-function-configuration --function-name "$function" --query Role --output text)"
cat >"$dir/role.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["dynamodb:UpdateItem","dynamodb:Scan"],
"Resource":"arn:aws:dynamodb:$region:$account:table/$table"}]}
EOF
aws iam put-role-policy --role-name "${role##*/}" --policy-name fm-lens-subscribers \
  --policy-document "file://$dir/role.json"

# The sender.
aws sesv2 get-configuration-set --region "$ses_region" --configuration-set-name fm-lens >/dev/null 2>&1 ||
  aws sesv2 create-configuration-set --region "$ses_region" --configuration-set-name fm-lens \
    --reputation-options ReputationMetricsEnabled=true
aws sesv2 get-email-identity --region "$ses_region" --email-identity "$domain" >/dev/null 2>&1 ||
  aws sesv2 create-email-identity --region "$ses_region" --email-identity "$domain" \
    --configuration-set-name fm-lens >/dev/null

# The schedule may run the relay, and nothing else.
function_arn="$(aws lambda get-function-configuration --function-name "$function" --query FunctionArn --output text)"
if ! aws iam get-role --role-name fm-lens-schedule >/dev/null 2>&1; then
  aws iam create-role --role-name fm-lens-schedule --query Role.Arn --output text --assume-role-policy-document \
    "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"scheduler.amazonaws.com\"},\"Action\":\"sts:AssumeRole\",\"Condition\":{\"StringEquals\":{\"aws:SourceAccount\":\"$account\"}}}]}"
  # IAM takes a moment before the scheduler may use a new role.
  sleep 10
fi
aws iam put-role-policy --role-name fm-lens-schedule --policy-name run-relay --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"$function_arn\"}]}"
cat >"$dir/target.json" <<EOF
{"Arn":"$function_arn","RoleArn":"arn:aws:iam::$account:role/fm-lens-schedule","Input":"{\"job\":\"report-counts\"}",
"RetryPolicy":{"MaximumRetryAttempts":2,"MaximumEventAgeInSeconds":600}}
EOF
if aws scheduler get-schedule --name fm-lens-counts >/dev/null 2>&1; then
  verb=update-schedule
else
  verb=create-schedule
fi
aws scheduler "$verb" --name fm-lens-counts --schedule-expression "rate(15 minutes)" \
  --flexible-time-window Mode=OFF --target "file://$dir/target.json" --query ScheduleArn --output text

# SUBSCRIBERS_TABLE joins the relay's environment, in place of Kit's key and form; the others, its GitHub token among
# them, stay as they are.
umask 077
aws lambda get-function-configuration --function-name "$function" --query Environment --output json >"$dir/env.json"
node -e '
  const fs = require("fs");
  const env = JSON.parse(fs.readFileSync(process.argv[1], "utf8")) ?? {};
  const { KIT_API_KEY, KIT_FORM, ...rest } = env.Variables ?? {};
  env.Variables = { ...rest, SUBSCRIBERS_TABLE: process.argv[2] };
  fs.writeFileSync(process.argv[1], JSON.stringify(env));
' "$dir/env.json" "$table"
aws lambda update-function-configuration --function-name "$function" --environment "file://$dir/env.json" \
  --query LastModified --output text

# Namecheap takes MX records only in place of its email forwarding, so bounces go to SES's own domain: DMARC passes on
# the DKIM signature, which is getfmlens.com's.
echo "DNS records for $domain (SES checks them by itself; then the status below reads SUCCESS):"
aws sesv2 get-email-identity --region "$ses_region" --email-identity "$domain" --output text \
  --query 'DkimAttributes.Tokens' | tr '\t' '\n' | while read -r token; do
  echo "  CNAME  $token._domainkey  $token.dkim.amazonses.com"
done
echo "  TXT    _dmarc  v=DMARC1; p=none;"
aws sesv2 get-email-identity --region "$ses_region" --email-identity "$domain" --output text \
  --query 'DkimAttributes.Status' | awk '{ print "Signing (DKIM): " $1 }'
