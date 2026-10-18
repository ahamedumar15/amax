# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B3] `.github/workflows/ci.yml:91` When the range request or the content-type check fails, the step exits with no message and no `docker logs amax`. The `/healthz` step above does print the logs. The two checks are also bare `test` and `grep -q` lines, so the log does not say which assertion failed or what status or header came back. Print the actual code and headers, and dump `docker logs amax` on failure, as the health step does. (round 1) <!-- fp:519be87ff34c -->
