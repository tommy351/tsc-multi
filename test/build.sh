#!/bin/bash

set -euo pipefail

TEST_DIR=$(dirname ${BASH_SOURCE[0]})
ROOT_DIR=$(dirname $TEST_DIR)

function tsc-multi {
  echo "> tsc-multi $@"
  $ROOT_DIR/bin/tsc-multi.js "$@"
}

function clean-tsc-multi {
  tsc-multi "$@" --clean
  tsc-multi "$@"
}

clean-tsc-multi $TEST_DIR/basic/tsconfig.json --config $TEST_DIR/tsc-multi.json
clean-tsc-multi $TEST_DIR/project-references/*/tsconfig.json --config $TEST_DIR/tsc-multi.json
