#!/bin/bash
# Build script for all Viberator worker Docker images
# Usage: ./build-workers.sh [image-type] [tag]
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
# Navigate to repo root (script is at infra/workers/scripts/, go up 3 levels)
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CATALOG_SCRIPT="$SCRIPT_DIR/worker-image-catalog.js"
TAG="${2:-latest}"
REGISTRY="${VIBERATOR_WORKER_REGISTRY:-}"
IMAGE_PREFIX="${VIBERATOR_WORKER_IMAGE_PREFIX:-viberator}"

# Worker metadata loaded from shared catalog
declare -a WORKER_TYPES=()
declare -A SCRIPT_IMAGE_NAMES=()
declare -A DOCKERFILES=()
declare -A AGENT_IMAGE_FLAGS=()

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

load_build_catalog() {
    local catalog_rows

    catalog_rows="$(node "$CATALOG_SCRIPT" list build)"

    WORKER_TYPES=()
    SCRIPT_IMAGE_NAMES=()
    DOCKERFILES=()
    AGENT_IMAGE_FLAGS=()

    while IFS=$'\t' read -r type script_image_name dockerfile is_agent; do
        if [ -z "$type" ]; then
            continue
        fi

        WORKER_TYPES+=("$type")
        SCRIPT_IMAGE_NAMES["$type"]="$script_image_name"
        DOCKERFILES["$type"]="$dockerfile"
        AGENT_IMAGE_FLAGS["$type"]="$is_agent"
    done <<< "$catalog_rows"

    if [ "${#WORKER_TYPES[@]}" -eq 0 ]; then
        log_error "No build image definitions loaded from catalog."
        exit 1
    fi
}

is_agent_image() {
    local type="$1"
    [ "${AGENT_IMAGE_FLAGS[$type]:-0}" = "1" ]
}

is_known_worker_type() {
    local type="$1"
    [ -n "${SCRIPT_IMAGE_NAMES[$type]+x}" ]
}

ensure_base_image() {
    local base_script_image_name="${SCRIPT_IMAGE_NAMES[base]:-}"
    local base_dockerfile="${DOCKERFILES[base]:-}"

    if [ -z "$base_script_image_name" ] || [ -z "$base_dockerfile" ]; then
        log_error "Base image metadata is missing from build catalog."
        return 1
    fi

    local base_image_name
    base_image_name="$(build_image_name "$base_script_image_name")"

    local base_tag="$base_image_name:latest"

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
    local dockerfile="${DOCKERFILES[$type]:-}"
    local script_image_name="${SCRIPT_IMAGE_NAMES[$type]:-}"
    local full_tag
    full_tag="$(build_full_tag "$script_image_name" "$TAG")"

    if [ -z "$dockerfile" ] || [ -z "$script_image_name" ]; then
        log_error "Missing catalog metadata for worker type: $type"
        return 1
    fi

    log_info "Building $type worker image..."
    log_info "Dockerfile: $dockerfile"
    log_info "Tag: $full_tag"

    cd "$REPO_ROOT"

    local build_args=()
    if is_agent_image "$type"; then
        # Agent images extend the shared base worker image.
        if ! ensure_base_image; then
            return 1
        fi

        local base_script_image_name="${SCRIPT_IMAGE_NAMES[base]:-base-worker}"
        local base_image_name
        base_image_name="$(build_image_name "$base_script_image_name")"
        build_args+=(--build-arg "BASE_IMAGE=$base_image_name:latest")
    fi

    if docker build -f "$dockerfile" -t "$full_tag" "${build_args[@]}" .; then
        log_info "Successfully built $full_tag"

        # Keep a local canonical base tag so agent builds can refer to it.
        if [ "$type" = "base" ]; then
            local local_base_image_name
            local_base_image_name="$(build_image_name "$script_image_name")"
            local local_base_tag="$local_base_image_name:latest"
            if [ "$full_tag" != "$local_base_tag" ]; then
                docker tag "$full_tag" "$local_base_tag"
                log_info "Also tagged local base image as $local_base_tag"
            fi
        fi

        # Also tag as latest if TAG is not latest
        if [ "$TAG" != "latest" ]; then
            local latest_tag
            latest_tag="$(build_full_tag "$script_image_name" "latest")"
            docker tag "$full_tag" "$latest_tag"
            log_info "Also tagged as $latest_tag"
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

    for type in "${WORKER_TYPES[@]}"; do
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

Build Viberator worker Docker images.

Arguments:
  image-type    Type of worker image to build (default: all)
                Options: $options

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
__USAGE__

    for type in "${WORKER_TYPES[@]}"; do
        echo "  - $type: ${DOCKERFILES[$type]}"
    done
}

# Main script logic
main() {
    load_build_catalog

    local image_type="${1:-all}"

    if [ "$image_type" = "-h" ] || [ "$image_type" = "--help" ]; then
        show_usage
        exit 0
    fi

    emit_naming_compatibility_warning

    log_info "Viberator Worker Image Builder"
    log_info "Repository: $REPO_ROOT"
    log_info "Registry: ${REGISTRY:-<local>}"
    log_info "Image Prefix: $IMAGE_PREFIX"
    log_info "Tag: $TAG"
    echo ""

    if [ "$image_type" = "all" ]; then
        build_all
    elif is_known_worker_type "$image_type"; then
        build_image "$image_type"
    else
        log_error "Unknown worker type: $image_type"
        echo ""
        show_usage
        exit 1
    fi
}

main "$@"
