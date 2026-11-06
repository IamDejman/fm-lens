#!/bin/sh
# Sends the relay's code to its Lambda function, fm-lens-report-relay. AWS_PROFILE and AWS_REGION pick the account.
set -eu
cd "$(dirname "$0")"
node --test
dir="$(mktemp -d)"
zip -q "$dir/relay.zip" index.js package.json
aws lambda update-function-code --function-name fm-lens-report-relay --zip-file "fileb://$dir/relay.zip" \
  --query LastModified --output text
rm -r "$dir"
