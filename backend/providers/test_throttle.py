"""Provider throttle + circuit breaker."""
from __future__ import annotations

import unittest

from providers import throttle


class TestThrottle(unittest.TestCase):
    def setUp(self):
        throttle.reset_circuits()

    def tearDown(self):
        throttle.reset_circuits()

    def test_opens_after_fails(self):
        for _ in range(3):
            throttle.record_provider_error("ryanair", 403)
        self.assertTrue(throttle.is_circuit_open("ryanair"))
        self.assertGreater(throttle.circuit_remaining_s("ryanair"), 0)

    def test_ok_resets(self):
        throttle.record_provider_error("ryanair", 403)
        throttle.record_provider_ok("ryanair")
        throttle.record_provider_error("ryanair", 403)
        self.assertFalse(throttle.is_circuit_open("ryanair"))


if __name__ == "__main__":
    unittest.main()
