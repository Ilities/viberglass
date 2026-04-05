#!/bin/bash
# One-stop script to set up and publish worker harness images to ECR
# Usage: ./setup-harness-images.sh [environment] [harness-type]
#   environment: dev | prod (default: dev)
#   harness-type: multi-agent | claude | lambda | qwen | gemini | mistral | codex | opencode | kimi | | base | all (default: multi-agent)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CATALOG_SCRIPT="$SCRIPT_DIR/worker-image-catalog.js"
ENVIRONMENT="${1:-dev}"
HARNESS_TYPE="${2:-multi-agent}"
REGION="${AWS_REGION:-eu-west-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ECR_REGISTRY="${ECR_REGISTRY:-}"

declare -a HARNESS_TYPES=()
declare -A HARNESS_IMAGES=()
declare -A DOCKERFILES=()
declare -A AGENT_IMAGE_FLAGS=()

BASE_IMAGE_PUBLISHED=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

load_harness_catalog() {
    HARNESS_TYPES=()
    HARNESS_IMAGES=()
    DOCKERFILES=()
    AGENT_IMAGE_FLAGS=()

    while IFS=$'\t' read -r type repository_name dockerfile is_agent; do
        if [ -z "$type" ]; then
            continue
        fi

        HARNESS_TYPES+=("$type")
        HARNESS_IMAGES["$type"]="$repository_name"
        DOCKERFILES["$type"]="$dockerfile"
        AGENT_IMAGE_FLAGS["$type"]="$is_agent"
    done < <(node "$CATALOG_SCRIPT" list harness)

    if [ "${#HARNESS_TYPES[@]}" -eq 0 ]; then
        log_error "No harness image definitions loaded from catalog."
        exit 1
    fi
}

resolve_ecr_registry() {
    if [ -n "$ECR_REGISTRY" ]; then
        return 0
    fi

    local account_id
    account_id=$(aws sts get-caller-identity --query Account --output text)
    ECR_REGISTRY="${account_id}.dkr.ecr.${REGION}.amazonaws.com"
}

is_agent_image() {
    local type="$1"
    [ "${AGENT_IMAGE_FLAGS[$type]:-0}" = "1" ]
}

# Login to ECR
login_ecr() {
    log_step "Logging into ECR..."
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
    log_info "Logged into ECR: $ECR_REGISTRY"
}

# Create ECR repository if it doesn't exist
create_repository() {
    local repo_name="$1"

    if aws ecr describe-repositories --repository-names "$repo_name" --region "$REGION" &>/dev/null; then
        log_info "Repository $repo_name already exists"
        return 0
    fi

    log_info "Creating ECR repository: $repo_name"
    aws ecr create-repository \
        --repository-name "$repo_name" \
        --image-scanning-configuration scanOnPush=true \
        --image-tag-mutability MUTABLE \
        --region "$REGION" >/dev/null

    # Set lifecycle policy to keep only last 10 images
    aws ecr put-lifecycle-policy \
        --repository-name "$repo_name" \
        --lifecycle-policy-text '{
            "rules": [
                {
                    "rulePriority": 1,
                    "description": "Keep last 10 images",
                    "selection": {
                        "tagStatus": "any",
                        "countType": "imageCountMoreThan",
                        "countNumber": 10
                    },
                    "action": {
                        "type": "expire"
                    }
                }
            ]
        }' \
        --region "$REGION" >/dev/null

    log_info "Created repository: $repo_name"
}

ensure_base_image_published() {
    if [ "$BASE_IMAGE_PUBLISHED" -eq 1 ]; then
        return 0
    fi

    log_step "Ensuring base image is published for agent builds..."
    if build_and_push_image "base"; then
        BASE_IMAGE_PUBLISHED=1
        return 0
    fi

    return 1
}

# Build and push a single image
build_and_push_image() {
    local type="$1"

    if [ "$type" = "base" ] && [ "$BASE_IMAGE_PUBLISHED" -eq 1 ]; then
        log_info "Base image already built and pushed in this run; skipping duplicate build."
        return 0
    fi

    if is_agent_image "$type"; then
        if ! ensure_base_image_published; then
            log_error "Failed to ensure base image for $type"
            return 1
        fi
    fi

    local image_name="${HARNESS_IMAGES[$type]}"
    local dockerfile="${DOCKERFILES[$type]}"
    local full_tag="$ECR_REGISTRY/$image_name:$IMAGE_TAG"
    local build_args=()

    log_step "Building $type ($image_name)..."

    cd "$REPO_ROOT"

    create_repository "$image_name"

    if is_agent_image "$type"; then
        build_args+=(--build-arg "BASE_IMAGE=$ECR_REGISTRY/${HARNESS_IMAGES[base]}:$IMAGE_TAG")
    fi

    # Build the image
    if docker build -f "$dockerfile" -t "$full_tag" "${build_args[@]}" .; then
        log_info "Built $full_tag"
    else
        log_error "Failed to build $type"
        return 1
    fi

    # Tag as latest if IMAGE_TAG is not latest
    if [ "$IMAGE_TAG" != "latest" ]; then
        docker tag "$full_tag" "$ECR_REGISTRY/$image_name:latest"
        log_info "Also tagged as $ECR_REGISTRY/$image_name:latest"
    fi

    # Push the image
    log_step "Pushing $type ($image_name)..."
    if docker push "$full_tag"; then
        log_info "Pushed $full_tag"
    else
        log_error "Failed to push $type"
        return 1
    fi

    # Push latest tag if IMAGE_TAG is not latest
    if [ "$IMAGE_TAG" != "latest" ]; then
        docker push "$ECR_REGISTRY/$image_name:latest"
        log_info "Pushed $ECR_REGISTRY/$image_name:latest"
    fi

    if [ "$type" = "base" ]; then
        BASE_IMAGE_PUBLISHED=1
    fi
}

# Build and push all images
build_all() {
    log_step "Building and pushing all harness images..."
    local failed=0

    for type in "${HARNESS_TYPES[@]}"; do
        if ! build_and_push_image "$type"; then
            failed=1
        fi
    done

    if [ $failed -eq 1 ]; then
        log_error "Some images failed to build/push"
        return 1
    fi

    log_info "All harness images built and pushed successfully!"
}

show_usage() {
    cat << EOF
Usage: $0 [environment] [image-type]

Build and publish worker harness images to ECR.

Arguments:
  environment   Target environment (default: dev)
                Options: dev, prod

  image-type    Type of worker image to build (default: multi-agent)
                Options: all and the harness types listed below

Environment Variables:
  AWS_REGION     AWS region (default: eu-west-1)
  IMAGE_TAG      Image tag/version (default: latest)

Examples:
  $0 dev                    # Build and push multi-agent harness image for dev (default)
  $0 dev all                # Build and push all harness images for dev
  $0 dev base               # Build and push only the base worker image
  $0 prod multi-agent       # Build and push only multi-agent for prod
  IMAGE_TAG=v1.0.0 $0 dev   # Build and push with specific tag

Note: The ECS worker image built by Pulumi (ecs-worker) is handled
by the workers infrastructure stack and is NOT included here.
Agent image builds automatically ensure viberator-base-worker is present in ECR.
EOF

    echo ""
    echo "Available harness types:"
    for type in "${HARNESS_TYPES[@]}"; do
        echo "  - $type"
    done
}

main() {
    load_harness_catalog

    if [ "$ENVIRONMENT" = "-h" ] || [ "$ENVIRONMENT" = "--help" ] || \
       [ "$HARNESS_TYPE" = "-h" ] || [ "$HARNESS_TYPE" = "--help" ]; then
        show_usage
        exit 0
    fi

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   Viberator Worker Harness Images Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    log_info "Environment: $ENVIRONMENT"
    log_info "Harness Type: $HARNESS_TYPE"
    log_info "Region: $REGION"
    log_info "Image Tag: $IMAGE_TAG"
    log_info "Repository Root: $REPO_ROOT"
    echo ""

    resolve_ecr_registry
    log_info "ECR Registry: $ECR_REGISTRY"
    echo ""

    # Login to ECR
    login_ecr
    echo ""

    if [ "$HARNESS_TYPE" = "all" ]; then
        build_all
    elif [ -n "${HARNESS_IMAGES[$HARNESS_TYPE]}" ]; then
        build_and_push_image "$HARNESS_TYPE"
    else
        log_error "Unknown harness type: $HARNESS_TYPE"
        echo ""
        show_usage
        exit 1
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

main "$@"
