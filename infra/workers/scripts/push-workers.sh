#!/bin/bash
# Push script for Viberator worker Docker images
# Usage: ./push-workers.sh [image-type] [tag]
#   image-type: all | claude | qwen | gemini | mistral | codex | kimi | multi-agent | testing | deployment | fullstack
#   tag: optional tag/version (default: latest)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="${VIBERATOR_WORKER_REGISTRY:-}"
IMAGE_PREFIX="${VIBERATOR_WORKER_IMAGE_PREFIX:-viberator}"
TAG="${2:-latest}"

# Array of all worker images
declare -A IMAGE_NAMES=(
    ["claude"]="viberator-worker"
    ["ecs"]="viberator-ecs-worker"
    ["lambda"]="viberator-lambda-worker"
    ["qwen"]="viberator-worker-qwen"
    ["gemini"]="viberator-worker-gemini"
    ["mistral"]="viberator-worker-mistral"
    ["codex"]="viberator-worker-codex"
    ["kimi"]="viberator-worker-kimi"
    ["multi-agent"]="viberator-worker-multi-agent"
    ["testing"]="viberator-worker-testing"
    ["deployment"]="viberator-worker-deployment"
    ["fullstack"]="viberator-worker-fullstack"
)

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

push_image() {
    local type="$1"
    local image_name="${IMAGE_NAMES[$type]}"
    local full_tag="$REGISTRY/$IMAGE_PREFIX-$image_name:$TAG"

    # Remove leading slash if registry is empty
    if [ -z "$REGISTRY" ]; then
        full_tag="$IMAGE_PREFIX-$image_name:$TAG"
        log_warn "No registry specified. Skipping push for local image: $full_tag"
        log_warn "Set VIBERATOR_WORKER_REGISTRY environment variable to push to a registry."
        return 0
    fi

    log_info "Pushing $type worker image: $full_tag"

    if docker push "$full_tag"; then
        log_info "Successfully pushed $full_tag"

        # Also push latest tag if TAG is not latest
        if [ "$TAG" != "latest" ]; then
            local latest_tag="$REGISTRY/$IMAGE_PREFIX-$image_name:latest"
            log_info "Pushing latest tag: $latest_tag"
            docker push "$latest_tag"
        fi

        return 0
    else
        log_error "Failed to push $type worker"
        return 1
    fi
}

push_all() {
    log_info "Pushing all worker images..."
    local failed=0

    for type in "${!IMAGE_NAMES[@]}"; do
        if ! push_image "$type"; then
            failed=1
        fi
    done

    if [ $failed -eq 1 ]; then
        log_error "Some images failed to push"
        exit 1
    fi

    log_info "All images pushed successfully!"
}

show_usage() {
    cat << EOF
Usage: $0 [image-type] [tag]

Push Viberator worker Docker images to registry.

Arguments:
  image-type    Type of worker image to push (default: all)
                Options: all, claude, ecs, lambda, qwen, gemini, mistral,
                         codex, kimi, multi-agent, testing, deployment, fullstack

  tag           Image tag/version (default: latest)

Environment Variables:
  VIBERATOR_WORKER_REGISTRY    Docker registry prefix (required for pushing)
                                Example: docker.io/myorg or 123456.dkr.ecr.us-east-1.amazonaws.com
  VIBERATOR_WORKER_IMAGE_PREFIX Image name prefix (default: viberator)

Examples:
  # Push all images to Docker Hub
  VIBERATOR_WORKER_REGISTRY=docker.io/myorg $0 all

  # Push all images to AWS ECR
  VIBERATOR_WORKER_REGISTRY=123456.dkr.ecr.us-east-1.amazonaws.com $0 all v1.0.0

  # Push only Qwen worker
  VIBERATOR_WORKER_REGISTRY=gcr.io/my-project $0 qwen

Available worker types:
EOF
    for type in "${!IMAGE_NAMES[@]}"; do
        echo "  - $type"
    done
}

# Main script logic
main() {
    local image_type="${1:-all}"

    if [ "$image_type" = "-h" ] || [ "$image_type" = "--help" ]; then
        show_usage
        exit 0
    fi

    if [ -z "$REGISTRY" ]; then
        log_warn "VIBERATOR_WORKER_REGISTRY not set."
        log_warn "Images will not be pushed. Set this variable to push to a registry."
        echo ""
    fi

    log_info "Viberator Worker Image Pusher"
    log_info "Registry: ${REGISTRY:-<local only>}"
    log_info "Image Prefix: $IMAGE_PREFIX"
    log_info "Tag: $TAG"
    echo ""

    if [ "$image_type" = "all" ]; then
        push_all
    elif [ -n "${IMAGE_NAMES[$image_type]}" ]; then
        push_image "$image_type"
    else
        log_error "Unknown worker type: $image_type"
        echo ""
        show_usage
        exit 1
    fi
}

main "$@"
