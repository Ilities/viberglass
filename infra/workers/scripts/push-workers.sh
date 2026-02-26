#!/bin/bash
# Push script for Viberator worker Docker images
# Usage: ./push-workers.sh [image-type] [tag]
#   image-type: all | single variant from catalog
#   tag: optional tag/version (default: latest)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOG_SCRIPT="$SCRIPT_DIR/worker-image-catalog.js"
REGISTRY="${VIBERATOR_WORKER_REGISTRY:-}"
IMAGE_PREFIX="${VIBERATOR_WORKER_IMAGE_PREFIX:-viberator}"
TAG="${2:-latest}"

# Worker metadata loaded from shared catalog
declare -a WORKER_TYPES=()
declare -A SCRIPT_IMAGE_NAMES=()

NAMING_WARNING_EMITTED=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

build_image_name() {
    local script_image_name="$1"

    if [ -n "$IMAGE_PREFIX" ]; then
        echo "$IMAGE_PREFIX-$script_image_name"
    else
        echo "$script_image_name"
    fi
}

build_full_tag() {
    local script_image_name="$1"
    local tag="$2"
    local image_name
    image_name="$(build_image_name "$script_image_name")"

    if [ -n "$REGISTRY" ]; then
        echo "$REGISTRY/$image_name:$tag"
    else
        echo "$image_name:$tag"
    fi
}

emit_naming_compatibility_warning() {
    if [ "$NAMING_WARNING_EMITTED" -eq 1 ]; then
        return 0
    fi

    log_warn "Image naming now uses VIBERATOR_WORKER_IMAGE_PREFIX + catalog scriptImageName."
    log_warn "If you previously relied on double-prefixed names (for example: viberator-viberator-worker), update your workflow to the new canonical names."

    NAMING_WARNING_EMITTED=1
}

load_push_catalog() {
    local catalog_rows

    catalog_rows="$(node "$CATALOG_SCRIPT" list push)"

    WORKER_TYPES=()
    SCRIPT_IMAGE_NAMES=()

    while IFS=$'\t' read -r type script_image_name _dockerfile _is_agent; do
        if [ -z "$type" ]; then
            continue
        fi

        WORKER_TYPES+=("$type")
        SCRIPT_IMAGE_NAMES["$type"]="$script_image_name"
    done <<< "$catalog_rows"

    if [ "${#WORKER_TYPES[@]}" -eq 0 ]; then
        log_error "No push image definitions loaded from catalog."
        exit 1
    fi
}

is_known_worker_type() {
    local type="$1"
    [ -n "${SCRIPT_IMAGE_NAMES[$type]+x}" ]
}

push_image() {
    local type="$1"
    local script_image_name="${SCRIPT_IMAGE_NAMES[$type]:-}"
    local full_tag
    full_tag="$(build_full_tag "$script_image_name" "$TAG")"

    if [ -z "$script_image_name" ]; then
        log_error "Missing catalog metadata for worker type: $type"
        return 1
    fi

    if [ -z "$REGISTRY" ]; then
        log_warn "No registry specified. Skipping push for local image: $full_tag"
        log_warn "Set VIBERATOR_WORKER_REGISTRY environment variable to push to a registry."
        return 0
    fi

    log_info "Pushing $type worker image: $full_tag"

    if docker push "$full_tag"; then
        log_info "Successfully pushed $full_tag"

        # Also push latest tag if TAG is not latest
        if [ "$TAG" != "latest" ]; then
            local latest_tag
            latest_tag="$(build_full_tag "$script_image_name" "latest")"
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

    for type in "${WORKER_TYPES[@]}"; do
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

build_options_list() {
    local options="all"

    for type in "${WORKER_TYPES[@]}"; do
        options="$options, $type"
    done

    echo "$options"
}

show_usage() {
    local options
    options="$(build_options_list)"

    cat << __USAGE__
Usage: $0 [image-type] [tag]

Push Viberator worker Docker images to registry.

Arguments:
  image-type    Type of worker image to push (default: all)
                Options: $options

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
__USAGE__

    for type in "${WORKER_TYPES[@]}"; do
        echo "  - $type"
    done
}

# Main script logic
main() {
    load_push_catalog

    local image_type="${1:-all}"

    if [ "$image_type" = "-h" ] || [ "$image_type" = "--help" ]; then
        show_usage
        exit 0
    fi

    emit_naming_compatibility_warning

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
    elif is_known_worker_type "$image_type"; then
        push_image "$image_type"
    else
        log_error "Unknown worker type: $image_type"
        echo ""
        show_usage
        exit 1
    fi
}

main "$@"
