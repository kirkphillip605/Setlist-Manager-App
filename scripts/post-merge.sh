#!/bin/bash
set -e

npm install --legacy-peer-deps
cd server && npm install --legacy-peer-deps
