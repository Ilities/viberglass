#!/usr/bin/env bash
set -euo pipefail

npm run build -w @viberglass/types

npm run build -w @viberglass/platform-ui -w @viberglass/integration-core

integration_ws=$(npm query '.workspace[name^=@viberglass/integration-]:not([name=@viberglass/integration-core]):not([name*=__])' --json \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).map(p=>"-w "+p.name).join(" ")))')

if [ -n "$integration_ws" ]; then
  npm run build $integration_ws
fi
