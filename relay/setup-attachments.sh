#!/bin/sh
# Sets up the bucket Report a problem puts screenshots and videos in, once: a bucket that takes uploads from the app
# (CORS) under the private `uploads/` and drops them after a day, serves `reports/`, where filing a report copies them,
# publicly, lets the relay's role put and copy files there, and tells the relay its name. Run it with
# AWS_PROFILE and AWS_REGION set for the relay's account; UPLOAD_BUCKET names the bucket (fm-lens-report-files-<account>
# by default). Running it again changes nothing that is already set.
set -eu
function=fm-lens-report-relay
region="${AWS_REGION:?set AWS_REGION}"
account="$(aws sts get-caller-identity --query Account --output text)"
bucket="${UPLOAD_BUCKET:-fm-lens-report-files-$account}"
dir="$(mktemp -d)"
trap 'rm -r "$dir"' EXIT

if ! aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  if [ "$region" = us-east-1 ]; then
    aws s3api create-bucket --bucket "$bucket" >/dev/null
  else
    aws s3api create-bucket --bucket "$bucket" --create-bucket-configuration "LocationConstraint=$region" >/dev/null
  fi
fi

# Reports are public, so their files are too; nothing else in the bucket is.
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
cat >"$dir/policy.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Sid":"ReportFiles","Effect":"Allow","Principal":"*",
"Action":"s3:GetObject","Resource":"arn:aws:s3:::$bucket/reports/*"}]}
EOF
aws s3api put-bucket-policy --bucket "$bucket" --policy "file://$dir/policy.json"

# The app puts each file at the address the relay signed for it.
cat >"$dir/cors.json" <<EOF
{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3000}]}
EOF
aws s3api put-bucket-cors --bucket "$bucket" --cors-configuration "file://$dir/cors.json"

# Uploads never finished, and uploads no report filed, are dropped after a day.
cat >"$dir/lifecycle.json" <<EOF
{"Rules":[{"ID":"AbortUploads","Status":"Enabled","Filter":{"Prefix":""},
"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}},
{"ID":"DropUnfiledUploads","Status":"Enabled","Filter":{"Prefix":"uploads/"},"Expiration":{"Days":1}}]}
EOF
aws s3api put-bucket-lifecycle-configuration --bucket "$bucket" --lifecycle-configuration "file://$dir/lifecycle.json"

# The relay signs uploads with its own role, and checks and copies them to `reports/` when a report is filed.
role="$(aws lambda get-function-configuration --function-name "$function" --query Role --output text)"
cat >"$dir/role.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:PutObject",
"Resource":["arn:aws:s3:::$bucket/uploads/*","arn:aws:s3:::$bucket/reports/*"]},
{"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::$bucket/uploads/*"}]}
EOF
aws iam put-role-policy --role-name "${role##*/}" --policy-name fm-lens-report-uploads \
  --policy-document "file://$dir/role.json"

# UPLOAD_BUCKET joins the relay's environment; the others, its GitHub token among them, stay as they are.
umask 077
aws lambda get-function-configuration --function-name "$function" --query Environment --output json >"$dir/env.json"
node -e '
  const fs = require("fs");
  const env = JSON.parse(fs.readFileSync(process.argv[1], "utf8")) ?? {};
  env.Variables = { ...(env.Variables ?? {}), UPLOAD_BUCKET: process.argv[2] };
  fs.writeFileSync(process.argv[1], JSON.stringify(env));
' "$dir/env.json" "$bucket"
aws lambda update-function-configuration --function-name "$function" --environment "file://$dir/env.json" \
  --query LastModified --output text
echo "Report files go to $bucket."
