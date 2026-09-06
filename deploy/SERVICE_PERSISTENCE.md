# DictAI 8771 service persistence

The previous transient user service stopped when the last SSH session ended because the server account had `Linger=no`. A successful HTTP check during SSH was therefore not enough to demonstrate availability after disconnect.

The replacement is a persistent user unit at `~/.config/systemd/user/dictai-practice-8771.service`, enabled for `default.target`. User lingering is enabled for `scpark` so its service manager survives logout and starts at boot. This does not change the TLS configuration, application code, model settings or learning data.

Install on the existing 68 server:

```bash
install -m 644 deploy/dictai-practice-8771.service /home/scpark/.config/systemd/user/dictai-practice-8771.service
loginctl enable-linger scpark
systemctl --user daemon-reload
systemctl --user enable --now dictai-practice-8771.service
```

Verify HTTPS from the client computer after all SSH sessions have closed, not only from inside the server. Trust the existing server certificate explicitly for diagnostic requests; do not disable certificate verification. Also confirm `Linger=yes` and that the unit is both enabled and active.

The change is operational; no GPU generation worker is started. To stop only the web service, run `systemctl --user disable --now dictai-practice-8771.service`. Do not disable account-wide lingering without checking other services that may rely on it.
