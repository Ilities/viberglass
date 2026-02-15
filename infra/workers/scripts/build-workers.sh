#!/bin/bash
# Build script for all Viberator worker Docker images
# Usage: ./build-workers.sh [image-type] [tag]
#   image-type: all | claude | qwen | gemini | mistral | codex | opencode | kimi | multi-agent | testing | deployment | fullstack
#   tag: optional tag/version (default: latest)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate to repo root (script is at infra/workers/scripts/, go up 3 levels)
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/infra/workers/docker"
TAG="${2:-latest}"
REGISTRY="${VIBERATOR_WORKER_REGISTRY:-}"
IMAGE_PREFIX="${VIBERATOR_WORKER_IMAGE_PREFIX:-viberator}"

# Array of all worker images
declare -A WORKER_IMAGES=(
    ["claude"]="infra/workers/docker/viberator-docker-worker.Dockerfile"
    ["ecs"]="infra/workers/docker/viberator-ecs-worker.Dockerfile"
    ["lambda"]="infra/workers/docker/viberator-lambda.Dockerfile"
    ["qwen"]="infra/workers/docker/agents/viberator-worker-qwen.Dockerfile"
    ["gemini"]="infra/workers/docker/agents/viberator-worker-gemini.Dockerfile"
    ["mistral"]="infra/workers/docker/agents/viberator-worker-mistral.Dockerfile"
    ["codex"]="infra/workers/docker/agents/viberator-worker-codex.Dockerfile"
    ["opencode"]="infra/workers/docker/agents/viberator-worker-opencode.Dockerfile"
    ["kimi"]="infra/workers/docker/agents/viberator-worker-kimi.Dockerfile"
    ["multi-agent"]="infra/workers/docker/viberator-worker-multi-agent.Dockerfile"
    ["testing"]="infra/workers/docker/tasks/viberator-worker-testing.Dockerfile"
    ["deployment"]="infra/workers/docker/tasks/viberator-worker-deployment.Dockerfile"
    ["fullstack"]="infra/workers/docker/tasks/viberator-worker-fullstack.Dockerfile"
)

declare -A IMAGE_NAMES=(
    ["claude"]="viberator-worker"
    ["ecs"]="viberator-ecs-worker"
    ["lambda"]="viberator-lambda-worker"
    ["qwen"]="viberator-worker-qwen"
    ["gemini"]="viberator-worker-gemini"
    ["mistral"]="viberator-worker-mistral"
    ["codex"]="viberator-worker-codex"
    ["opencode"]="viberator-worker-opencode"
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

ensure_base_image() {
    local base_tag="$IMAGE_PREFIX-base-worker:latest"
    local base_dockerfile="infra/workers/docker/base/base-worker.Dockerfile"

    if docker image inspect "$base_tag" >/dev/null 2>&1; then
        log_info "Base image already present: $base_tag"
        return 0
    fi

    log_info "Base image not found. Building $base_tag from $base_dockerfile"
    cd "$REPO_ROOT"
    if docker build -f "$base_dockerfile" -t "$base_tag" .; then
        log_info "Successfully built base image: $base_tag"
        return 0
    else
        log_error "Failed to build base image: $base_tag"
        return 1
    fi
}

build_image() {
    local type="$1"
    local dockerfile="${WORKER_IMAGES[$type]}"
    local image_name="${IMAGE_NAMES[$type]}"
    local full_tag="$REGISTRY/$IMAGE_PREFIX-$image_name:$TAG"

    # Remove leading slash if registry is empty
    if [ -z "$REGISTRY" ]; then
        full_tag="$IMAGE_PREFIX-$image_name:$TAG"
    fi

    log_info "Building $type worker image..."
    log_info "Dockerfile: $dockerfile"
    log_info "Tag: $full_tag"

    cd "$REPO_ROOT"

    # Build arguments for base image
    BUILD_ARGS=""
    if [[ "$dockerfile" == infra/workers/docker/agents/* ]]; then
        # Agent images extend the shared base worker image.
        if ! ensure_base_image; then
            return 1
        fi
        BUILD_ARGS="--build-arg BASE_IMAGE=$IMAGE_PREFIX-base-worker:latest"
    fi

    if docker build -f "$dockerfile" -t "$full_tag" $BUILD_ARGS .; then
        log_info "Successfully built $full_tag"

        # Also tag as latest if TAG is not latest
        if [ "$TAG" != "latest" ]; then
            docker tag "$full_tag" "$REGISTRY/$IMAGE_PREFIX-$image_name:latest"
            log_info "Also tagged as $REGISTRY/$IMAGE_PREFIX-$image_name:latest"
        fi

        return 0
    else
        log_error "Failed to build $type worker"
        return 1
    fi
}

build_all() {
    log_info "Building all worker images..."
    local failed=0

    for type in "${!WORKER_IMAGES[@]}"; do
        if ! build_image "$type"; then
            failed=1
        fi
    done

    if [ $failed -eq 1 ]; then
        log_error "Some images failed to build"
        exit 1
    fi

    log_info "All images built successfully!"
}

show_usage() {
    cat << EOF
Usage: $0 [image-type] [tag]

Build Viberator worker Docker images.

Arguments:
  image-type    Type of worker image to build (default: all)
                Options: all, claude, ecs, lambda, qwen, gemini, mistral,
                         codex, opencode, kimi, multi-agent, testing, deployment, fullstack

  tag           Image tag/version (default: latest)

Environment Variables:
  VIBERATOR_WORKER_REGISTRY    Docker registry prefix (e.g., docker.io/myorg)
  VIBERATOR_WORKER_IMAGE_PREFIX Image name prefix (default: viberator)

Examples:
  $0 all                    # Build all images with latest tag
  $0 all v1.0.0            # Build all images with v1.0.0 tag
  $0 qwen                  # Build only Qwen worker with latest tag
  VIBERATOR_WORKER_REGISTRY=registry.example.com $0 multi-agent

Available worker types:
EOF
    for type in "${!WORKER_IMAGES[@]}"; do
        echo "  - $type: ${WORKER_IMAGES[$type]}"
    done
}

# Main script logic
main() {
    local image_type="${1:-all}"

    if [ "$image_type" = "-h" ] || [ "$image_type" = "--help" ]; then
        show_usage
        exit 0
    fi

    log_info "Viberator Worker Image Builder"
    log_info "Repository: $REPO_ROOT"
    log_info "Registry: ${REGISTRY:-<local>}"
    log_info "Image Prefix: $IMAGE_PREFIX"
    log_info "Tag: $TAG"
    echo ""

    if [ "$image_type" = "all" ]; then
        build_all
    elif [ -n "${WORKER_IMAGES[$image_type]}" ]; then
        build_image "$image_type"
    else
        log_error "Unknown worker type: $image_type"
        echo ""
        show_usage
        exit 1
    fi
}

main "$@"
