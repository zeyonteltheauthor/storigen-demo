# Grade Along v30 test report (2026-11-23)
- test/grade-along-terms-e2e.cjs: 10/10 pass (Terms page 200, prices, renewal reminder, 30-day notice, refund rule, no draft markers, no scripts, no outside requests)
- test/grade-along-individual-e2e.cjs: 21/21 pass (billing off: coming soon + gate link hidden; billing on in test mode with mocked Stripe: Terms link, Terms version recorded, checkout, code, main app)
- test/grade-along-v29-e2e.cjs: 54/54 pass (label now v30)
- test/grade-along-retention-e2e.cjs: 33/33 pass (label now v30)
- unit: web, individual, v29, retention pass. grade-along-v24.test.mjs fails identically on the unchanged v29 tree (pre-existing, not caused by v30).
