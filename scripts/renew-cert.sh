#!/bin/sh
# Keep the www.heitu.tech TLS certificate ahead of its expiry date.
#
# Runs daily from /etc/cron.d/certbot-renew and can be executed manually:
#   /usr/local/bin/renew-heitu-cert.sh          # renew only when due
#   /usr/local/bin/renew-heitu-cert.sh --test   # force a real re-issue now
#
# The --test mode exists to prove the server can actually obtain a new
# certificate; it consumes one duplicate-certificate allowance per week.
set -eu

DOMAIN=www.heitu.tech
CERT=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
LOG=/var/log/heitu-cert-renew.log
MIN_DAYS=30

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$DOMAIN] $*" >> "$LOG"
}

days_left() {
  end=$(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2)
  echo $(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
}

serial_of_file() {
  openssl x509 -in "$CERT" -noout -serial | cut -d= -f2
}

serial_served() {
  echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null \
    | openssl x509 -noout -serial 2>/dev/null | cut -d= -f2 || true
}

mode=${1:-auto}
before_days=$(days_left)
before_serial=$(serial_of_file)
log "start mode=$mode days_left=$before_days serial=$before_serial"

if [ "$mode" = "--test" ]; then
  certbot renew --cert-name "$DOMAIN" --force-renewal --quiet
else
  certbot renew --quiet
fi

systemctl reload nginx

after_days=$(days_left)
after_serial=$(serial_of_file)

# nginx reloads asynchronously: give the workers a moment to pick up the new
# certificate before comparing what TLS actually serves.
served_serial=""
i=0
while [ "$i" -lt 15 ]; do
  served_serial=$(serial_served)
  [ "$served_serial" = "$after_serial" ] && break
  i=$((i + 1))
  sleep 1
done

log "end days_left=$after_days serial=$after_serial served=$served_serial"

if [ "$after_days" -lt "$MIN_DAYS" ]; then
  log "ERROR certificate still expires within $MIN_DAYS days - renewal failed"
  exit 1
fi

if [ "$after_serial" = "$before_serial" ]; then
  log "certificate not due yet, nothing changed"
else
  log "certificate renewed: $before_serial -> $after_serial"
fi

if [ -n "$served_serial" ] && [ "$served_serial" != "$after_serial" ]; then
  log "WARNING nginx is serving serial $served_serial instead of $after_serial"
  exit 1
fi

echo "OK: $DOMAIN valid for $after_days more days (serial $after_serial, served $served_serial)"
