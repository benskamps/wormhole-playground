"""Smoke tests for field_propagation.py.

These exist so a NumPy API removal (np.trapz, gone in NumPy 2.0) cannot
silently kill the script again: every test reaches analyze_transmission,
and the last one runs main() end to end, figures and GIF included.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))

import field_propagation as fp  # noqa: E402


def test_tiny_grid_runs_to_completion():
    sim = fp.WormholeWaveSimulator(throat_radius=1.0, l_min=-6.0, l_max=6.0,
                                   n_points=120)
    result = sim.propagate_wave_packet(initial_position=3.0, initial_width=1.0,
                                       initial_velocity=-1.0,
                                       angular_momentum=2, t_max=2.0, dt=0.01)
    analysis = sim.analyze_transmission(result)
    assert set(analysis) == {"transmission", "reflection", "conservation"}
    for value in analysis.values():
        assert math.isfinite(float(value))
    # The packet starts entirely in universe A, so it must have mass there.
    assert analysis["reflection"] > 0


def test_trapezoid_shim_matches_known_integral():
    x = np.linspace(0.0, 1.0, 101)
    assert abs(fp._trapezoid(x**2, x) - 1.0 / 3.0) < 1e-4


def test_main_end_to_end(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    fp.main()
    out = capsys.readouterr().out
    assert "ANGULAR MOMENTUM FILTERING" in out
    for name in ("wormhole_wave_m0.png", "wormhole_wave_m2.png",
                 "wormhole_wave_m5.png", "wormhole_wave.gif"):
        assert (tmp_path / name).stat().st_size > 0, name
