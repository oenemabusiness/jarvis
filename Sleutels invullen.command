#!/bin/bash
# Opent het verborgen bestand .env in TextEdit, zodat je er sleutels in kunt plakken.
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
open -e .env
