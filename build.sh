#!/usr/bin/env bash
set -o errexit  # dừng nếu lỗi

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate
