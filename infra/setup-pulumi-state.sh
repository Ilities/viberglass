#!/bin/bash
# Setup S3 bucket for Pulumi state backend
# Usage: ./setup-pulumi-state.sh [bucket-name] [region]

set -e

BUCKET_NAME=${1:-"viberglass-pulumi-state"}
REGION=${2:-"eu-west-1"}

echo "Creating S3 bucket for Pulumi state: $BUCKET_NAME"
echo "Region: $REGION"

# Check if bucket already exists
if aws s3 ls "s3://$BUCKET_NAME" 2>/dev/null; then
  echo "Bucket $BUCKET_NAME already exists. Skipping creation."
else
  # Create bucket (handling eu-west-1 differently)
  if [ "$REGION" = "eu-west-1" ]; then
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "Bucket created: $BUCKET_NAME"
fi

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

echo "Versioning enabled on $BUCKET_NAME"

# Enable default encryption
aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }
    ]
  }'

echo "Encryption enabled on $BUCKET_NAME"

# Block public access
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }'

echo "Public access blocked on $BUCKET_NAME"

echo ""
echo "S3 bucket setup complete!"
echo ""
echo "To use this backend for Pulumi, run:"
echo ""
echo "  pulumi login s3://$BUCKET_NAME"
echo ""
echo "Or set the environment variable:"
echo ""
echo "  export PULUMI_BACKEND_URL=s3://$BUCKET_NAME"
echo ""
